/**
 * Parse the unified diff that `git diff --cached` produces into a structured
 * shape the rest of the pipeline can reason about. This is deliberately a
 * small hand-written parser rather than a dependency: the format is stable
 * and we only need the parts that inform a commit message.
 *
 * The output is an array of FileChange objects:
 *   {
 *     path:        current path of the file
 *     oldPath:     previous path (differs from `path` only on a rename)
 *     status:      'added' | 'deleted' | 'modified' | 'renamed'
 *     binary:      true if git reported a binary diff
 *     added:       count of added lines (the +++ side, excluding the header)
 *     removed:     count of removed lines
 *     hunks:       [{ header, lines: [{ kind: 'add'|'del'|'ctx', text }] }]
 *   }
 */

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+?)$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

/**
 * @param {string} raw  the full text of `git diff --cached`
 * @returns {Array<object>} structured file changes
 */
export function parseDiff(raw) {
  if (!raw || !raw.trim()) return [];

  const lines = raw.split("\n");
  const files = [];
  let current = null;
  let hunk = null;

  const pushCurrent = () => {
    if (current) {
      if (hunk) current.hunks.push(hunk);
      files.push(current);
    }
    hunk = null;
  };

  for (const line of lines) {
    const fileMatch = line.match(FILE_HEADER);
    if (fileMatch) {
      pushCurrent();
      const [, aPath, bPath] = fileMatch;
      current = {
        path: bPath,
        oldPath: aPath,
        status: aPath === bPath ? "modified" : "renamed",
        binary: false,
        added: 0,
        removed: 0,
        hunks: [],
      };
      continue;
    }

    if (!current) continue; // preamble before the first file header

    // Metadata lines that refine status / paths.
    if (line.startsWith("new file mode")) {
      current.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.oldPath = line.slice("rename from ".length);
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) {
      current.binary = true;
      continue;
    }
    // Ignore the textual ---/+++ path markers and index/mode lines.
    if (
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("index ") ||
      line.startsWith("old mode ") ||
      line.startsWith("new mode ") ||
      line.startsWith("similarity index ") ||
      line.startsWith("dissimilarity index ")
    ) {
      continue;
    }

    if (HUNK_HEADER.test(line)) {
      if (hunk) current.hunks.push(hunk);
      hunk = { header: line, lines: [] };
      continue;
    }

    if (!hunk) continue;

    if (line.startsWith("+")) {
      current.added += 1;
      hunk.lines.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      current.removed += 1;
      hunk.lines.push({ kind: "del", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      hunk.lines.push({ kind: "ctx", text: line.slice(1) });
    }
    // A bare "\ No newline at end of file" is intentionally ignored.
  }

  pushCurrent();
  return files;
}

/**
 * Aggregate counts across a parsed diff -- used for both the prompt context
 * and the offline summarizer.
 *
 * @param {Array<object>} files  output of parseDiff
 */
export function summarizeStats(files) {
  const stats = {
    files: files.length,
    added: 0,
    removed: 0,
    byStatus: { added: 0, deleted: 0, modified: 0, renamed: 0 },
  };
  for (const f of files) {
    stats.added += f.added;
    stats.removed += f.removed;
    stats.byStatus[f.status] += 1;
  }
  return stats;
}
