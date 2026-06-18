/**
 * Build the prompt sent to an LLM provider.
 *
 * The prompt is deliberately strict: we want a commit message, not a chat
 * reply. We give the model the change statistics, the (noise-collapsed,
 * budget-trimmed) diff, and explicit formatting rules for the chosen style.
 * The provider layer is responsible only for transport; all the "what good
 * looks like" lives here so it is testable without a network.
 */

import { summarizeStats } from "./diff-parser.js";
import { processDiff } from "./diff-processor.js";

const SUBJECT_LIMIT = 72;

const STYLE_RULES = {
  conventional: [
    "Use the Conventional Commits format: `type(scope): subject`.",
    "Choose type from: feat, fix, refactor, perf, docs, test, build, ci, style, chore.",
    "Scope is optional; use the most relevant module/directory when one dominates.",
    `Keep the subject line under ${SUBJECT_LIMIT} characters, imperative mood, no trailing period.`,
    "If the change is non-trivial, add a blank line then 1-4 short bullet points explaining what and why.",
  ],
  prose: [
    "Write a single short imperative sentence summarising the change (no type prefix).",
    `Keep the first line under ${SUBJECT_LIMIT} characters, sentence case, no trailing period.`,
    "If helpful, add a blank line then 1-3 sentences of context on what changed and why.",
  ],
};

export const SYSTEM_PROMPT =
  "You are a precise software engineer writing a git commit message for a " +
  "colleague who will read it during code review. Describe the change " +
  "accurately based only on the diff provided. Do not invent motivations " +
  "that are not evident. Output only the commit message text -- no preamble, " +
  "no code fences, no commentary.";

/**
 * @param {Array<object>} files  parsed diff
 * @param {object} [opts]
 * @param {'conventional'|'prose'} [opts.style]
 * @param {number} [opts.budget]
 * @param {string} [opts.branch]  current branch name, used as a weak hint
 * @returns {{ system: string, user: string, meta: object }}
 */
export function buildPrompt(files, opts = {}) {
  const style = opts.style ?? "conventional";
  const stats = summarizeStats(files);
  const processed = processDiff(files, { budget: opts.budget });

  const rules = STYLE_RULES[style] ?? STYLE_RULES.conventional;

  const statLine =
    `${stats.files} file(s) changed, +${stats.added} -${stats.removed} ` +
    `(${stats.byStatus.added} added, ${stats.byStatus.modified} modified, ` +
    `${stats.byStatus.deleted} deleted, ${stats.byStatus.renamed} renamed).`;

  const branchHint =
    opts.branch && !/^(main|master|develop|dev)$/.test(opts.branch)
      ? `\nCurrent branch: ${opts.branch} (may hint at intent, but trust the diff).`
      : "";

  const truncationNote = processed.truncated
    ? "\nNote: the diff below was truncated to fit a size budget; some files " +
      "are shown as headers only. Summarise the overall change, not just the " +
      "visible lines."
    : "";

  const user = [
    "Write a commit message for the following staged changes.",
    "",
    "Rules:",
    ...rules.map((r) => `- ${r}`),
    "",
    `Change summary: ${statLine}${branchHint}${truncationNote}`,
    "",
    "Diff:",
    "```diff",
    processed.text,
    "```",
  ].join("\n");

  return {
    system: SYSTEM_PROMPT,
    user,
    meta: {
      style,
      truncated: processed.truncated,
      includedFiles: processed.included,
      omittedFiles: processed.omitted,
      stats,
    },
  };
}

export { SUBJECT_LIMIT };
