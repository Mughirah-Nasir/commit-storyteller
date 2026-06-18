/**
 * The offline engine.
 *
 * Given a parsed diff, produce a Conventional-Commits-style subject (and a
 * short body) using only deterministic heuristics -- no network, no API key.
 *
 * This exists for two reasons:
 *   - It is the zero-config experience: `storyteller` works the moment you
 *     install it, before you have set up any provider.
 *   - It is the fallback: if a configured LLM call fails (offline, rate
 *     limited, bad key) the hook still produces something useful instead of
 *     blocking your commit.
 *
 * It will never be as fluent as a model, and it does not pretend to infer
 * *why* a change was made. It infers *what* changed and *where*, which is
 * most of the value and is always correct because it is derived directly
 * from the diff.
 */

import { summarizeStats } from "./diff-parser.js";

// Map a path to a Conventional-Commits "scope" (the directory that best
// characterises the change) and to a likely commit type.
const TEST_RE = /(^|\/)(test|tests|__tests__|spec)(\/|$)|\.(test|spec)\./;
const DOCS_RE = /(^|\/)(docs?|README|CHANGELOG|LICENSE)/i;
const CI_RE = /(^|\/)(\.github\/workflows|\.gitlab-ci|Jenkinsfile|\.circleci)/;
const BUILD_RE =
  /(^|\/)(package\.json|pyproject\.toml|Dockerfile|docker-compose|Makefile|tsconfig|\.eslintrc|vite\.config|webpack\.config)/;
const STYLE_RE = /\.(css|scss|less|styl)$/;

/**
 * @param {Array<object>} files  output of parseDiff
 * @param {object} [opts]
 * @param {'conventional'|'prose'} [opts.style]
 * @returns {{ subject: string, body: string }}
 */
export function offlineSummary(files, opts = {}) {
  const style = opts.style ?? "conventional";
  const meaningful = files.filter((f) => !looksGenerated(f.path));
  const considered = meaningful.length ? meaningful : files;

  const type = inferType(considered);
  const scope = inferScope(considered);
  const subject = buildSubject(considered, type, scope, style);
  const body = buildBody(files);

  return { subject, body };
}

function looksGenerated(path) {
  return (
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum)$/.test(
      path,
    ) || /(^|\/)(dist|build)\//.test(path)
  );
}

function inferType(files) {
  const all = (re) => files.length > 0 && files.every((f) => re.test(f.path));
  const some = (re) => files.some((f) => re.test(f.path));

  if (all(TEST_RE)) return "test";
  if (all(DOCS_RE)) return "docs";
  if (all(CI_RE)) return "ci";
  if (all(STYLE_RE)) return "style";

  const onlyAdds = files.length > 0 && files.every((f) => f.status === "added");
  const anyDeleted = files.some((f) => f.status === "deleted");

  // A change that only adds new files most often introduces a feature.
  if (onlyAdds && !some(TEST_RE) && !some(DOCS_RE)) return "feat";

  // Removing code without adding much looks like cleanup/refactor.
  const totalAdded = files.reduce((n, f) => n + f.added, 0);
  const totalRemoved = files.reduce((n, f) => n + f.removed, 0);
  if (anyDeleted && totalRemoved > totalAdded * 2) return "refactor";

  if (some(BUILD_RE) && files.length <= 2) return "build";

  // Default: a code change of unknown intent. "chore" would undersell most
  // real edits, so we use "fix" only when the change is small and surgical,
  // otherwise "feat" for substantial additions, else "refactor".
  if (totalAdded + totalRemoved <= 20) return "fix";
  if (totalAdded > totalRemoved * 1.5) return "feat";
  return "refactor";
}

function inferScope(files) {
  if (files.length === 1) {
    return topDir(files[0].path);
  }
  // Most common top-level directory among changed files.
  const counts = new Map();
  for (const f of files) {
    const dir = topDir(f.path);
    if (!dir) continue;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [dir, n] of counts) {
    if (n > bestCount) {
      best = dir;
      bestCount = n;
    }
  }
  // Only use a scope if it actually characterises the majority of the change.
  return bestCount >= Math.ceil(files.length / 2) ? best : null;
}

function topDir(path) {
  const parts = path.split("/");
  if (parts.length === 1) return null; // top-level file, no meaningful scope
  // Skip a leading "src" so the scope is the module, not the layout.
  if (parts[0] === "src" && parts.length > 2) return parts[1];
  return parts[0];
}

function buildSubject(files, type, scope, style) {
  const stats = summarizeStats(files);
  const primary = pickPrimaryFile(files);
  const what = describeChange(files, primary, stats);

  if (style === "prose") {
    // Sentence case, no type prefix.
    return capitalize(what);
  }
  const scopePart = scope ? `(${scope})` : "";
  return `${type}${scopePart}: ${what}`;
}

function pickPrimaryFile(files) {
  // The file with the most churn that is not generated/test scaffolding.
  let best = null;
  let bestChurn = -1;
  for (const f of files) {
    if (looksGenerated(f.path)) continue;
    const churn = f.added + f.removed;
    if (churn > bestChurn) {
      best = f;
      bestChurn = churn;
    }
  }
  return best ?? files[0] ?? null;
}

function describeChange(files, primary, stats) {
  if (!primary) return "update repository";

  const name = baseName(primary.path);

  if (files.length === 1) {
    switch (primary.status) {
      case "added":
        return `add ${name}`;
      case "deleted":
        return `remove ${name}`;
      case "renamed":
        return `rename ${baseName(primary.oldPath)} to ${name}`;
      default:
        return `update ${name}`;
    }
  }

  // Multiple files: describe by dominant action + spread.
  const { added, deleted, modified, renamed } = stats.byStatus;
  const fileWord = stats.files === 1 ? "file" : "files";

  if (added > 0 && modified === 0 && deleted === 0 && renamed === 0) {
    return `add ${added} ${added === 1 ? "file" : "files"} including ${name}`;
  }
  if (deleted > 0 && added === 0 && modified === 0) {
    return `remove ${deleted} ${deleted === 1 ? "file" : "files"}`;
  }
  return `update ${stats.files} ${fileWord} (${name} and others)`;
}

function buildBody(files) {
  if (files.length <= 1) return "";

  const lines = [];
  for (const f of files.slice(0, 10)) {
    lines.push(
      `- ${changeVerb(f)} ${f.status === "renamed" ? `${f.oldPath} -> ${f.path}` : f.path}`,
    );
  }
  if (files.length > 10) lines.push(`- ...and ${files.length - 10} more files`);
  return lines.join("\n");
}

function changeVerb(file) {
  return {
    added: "add",
    deleted: "remove",
    modified: "update",
    renamed: "rename",
  }[file.status];
}

function baseName(path) {
  return path.split("/").pop();
}

function capitalize(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
