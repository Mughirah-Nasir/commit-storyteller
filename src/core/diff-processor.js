/**
 * Prepare a parsed diff for an LLM prompt.
 *
 * Two real problems this solves:
 *
 *  1. Noise. Lockfiles, minified bundles, snapshots and other generated files
 *     can be thousands of lines of churn that tell a human nothing about
 *     *intent*. We keep the fact that they changed but drop their line-level
 *     content so they don't drown the signal (or the token budget).
 *
 *  2. Budget. Models have a context limit and you pay per token. We greedily
 *     include the most informative files first and trim hunks once we approach
 *     a character budget (a cheap, deterministic proxy for tokens -- roughly
 *     4 chars/token for code).
 *
 * The result is a compact textual rendering plus a flag telling the caller
 * whether anything was truncated (useful for the prompt and for tests).
 */

const NOISE_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)composer\.lock$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.snap$/,
  /(^|\/)__snapshots__\//,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|zip|gz)$/i,
];

const DEFAULT_BUDGET = 12000; // characters of diff body
const PER_FILE_LINE_CAP = 200; // never feed more than this many lines from one file

/**
 * @param {string} path
 * @returns {boolean} true if the file is generated/noise
 */
export function isNoiseFile(path) {
  return NOISE_PATTERNS.some((re) => re.test(path));
}

/**
 * Informativeness score used to order files when trimming. Source files with
 * a moderate, human-sized change rank above giant churn and above noise.
 *
 * @param {object} file  a FileChange from diff-parser
 */
function score(file) {
  if (file.binary || isNoiseFile(file.path)) return -1;
  const churn = file.added + file.removed;
  // A gentle penalty for very large churn so a 4000-line vendored file does
  // not outrank a focused 30-line change to real logic.
  return churn <= 400 ? churn : 400 - (churn - 400) * 0.1;
}

/**
 * @param {Array<object>} files  output of parseDiff
 * @param {object} [opts]
 * @param {number} [opts.budget]  character budget for the rendered body
 * @returns {{ text: string, truncated: boolean, included: number, omitted: number }}
 */
export function processDiff(files, opts = {}) {
  const budget = opts.budget ?? DEFAULT_BUDGET;

  const ordered = [...files].sort((a, b) => score(b) - score(a));

  const blocks = [];
  let used = 0;
  let truncated = false;
  let included = 0;
  let omitted = 0;

  for (const file of ordered) {
    if (file.binary || isNoiseFile(file.path)) {
      blocks.push(renderHeaderOnly(file));
      omitted += 1;
      continue;
    }

    const body = renderFileBody(file, PER_FILE_LINE_CAP);
    if (used + body.length > budget && included > 0) {
      // Out of room -- record the rest as header-only so the model still
      // knows these files participated in the change.
      blocks.push(renderHeaderOnly(file));
      truncated = true;
      omitted += 1;
      continue;
    }

    blocks.push(body);
    used += body.length;
    included += 1;
  }

  return { text: blocks.join("\n\n"), truncated, included, omitted };
}

function statusVerb(status) {
  return {
    added: "added",
    deleted: "deleted",
    modified: "modified",
    renamed: "renamed",
  }[status];
}

function renderHeaderOnly(file) {
  if (file.status === "renamed") {
    return (
      `# ${statusVerb(file.status)}: ${file.oldPath} -> ${file.path}` +
      (file.binary ? " (binary)" : ` (+${file.added} -${file.removed}, content omitted)`)
    );
  }
  const note = file.binary ? "binary" : "content omitted";
  return `# ${statusVerb(file.status)}: ${file.path} (+${file.added} -${file.removed}, ${note})`;
}

function renderFileBody(file, lineCap) {
  const head =
    file.status === "renamed"
      ? `# ${statusVerb(file.status)}: ${file.oldPath} -> ${file.path} (+${file.added} -${file.removed})`
      : `# ${statusVerb(file.status)}: ${file.path} (+${file.added} -${file.removed})`;

  const rendered = [];
  let count = 0;
  let capped = false;

  outer: for (const hunk of file.hunks) {
    for (const ln of hunk.lines) {
      if (ln.kind === "ctx") continue; // context lines add bulk, not signal
      if (count >= lineCap) {
        capped = true;
        break outer;
      }
      rendered.push((ln.kind === "add" ? "+ " : "- ") + ln.text);
      count += 1;
    }
  }

  if (capped) rendered.push(`  ... (${file.path} change truncated at ${lineCap} lines)`);
  return [head, ...rendered].join("\n");
}
