/**
 * Clean a generated commit message and merge it into git's commit message
 * file without destroying what git or the user already put there.
 *
 * This module is where the subtle bugs live, so it is small, pure, and
 * heavily tested:
 *
 *  - Models love to wrap output in ```fences``` or prefix "Here is your
 *    commit message:". We strip that.
 *  - The commit message file (`.git/COMMIT_EDITMSG`) contains comment lines
 *    starting with `#` (the "Please enter the commit message..." block,
 *    plus the status summary). We must preserve those comments so git's own
 *    behaviour and the user's review experience are unchanged, and we must
 *    insert our generated text *above* them, not clobber them.
 *  - If the user already typed a message (e.g. `git commit -m "wip"`), we
 *    must not overwrite it. The generated text is a suggestion, not a
 *    takeover.
 */

import { SUBJECT_LIMIT } from "./prompt-builder.js";

const FENCE_RE = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/;
// Strip a conversational opener ONLY when it is a recognised whole phrase.
// Critically, the alternatives are bounded so this can never swallow a
// following Conventional-Commits "type:" prefix (e.g. "Sure! fix: x" must
// keep "fix: x", losing only "Sure! ").
const LEAD_IN_RE =
  /^(?:sure[!,. ]+|certainly[!,. ]+|here(?:'s| is)\b[^\n:]*:\s*|(?:your\s+)?commit message:\s*)/i;

/**
 * Normalise raw model output into a clean commit message string.
 *
 * @param {string} raw
 * @returns {string} cleaned message (may be multi-line); '' if nothing usable
 */
export function sanitizeMessage(raw) {
  if (!raw) return "";

  let text = raw.replace(/\r\n/g, "\n").trim();

  // Unwrap a single surrounding code fence.
  const fenced = text.match(FENCE_RE);
  if (fenced) text = fenced[1].trim();

  // Drop a conversational lead-in on the first line.
  text = text.replace(LEAD_IN_RE, "");

  const lines = text.split("\n");
  if (lines.length === 0) return "";

  // Subject: first non-empty line, trimmed of surrounding quotes/periods.
  let subject = (lines.shift() ?? "").trim();
  subject = stripWrappingQuotes(subject).replace(/\.$/, "").trim();
  if (subject.length > SUBJECT_LIMIT) {
    subject = subject.slice(0, SUBJECT_LIMIT - 1).trimEnd() + "\u2026";
  }
  if (!subject) return "";

  // Body: drop a leading blank line, collapse 3+ blank lines to one.
  const body = lines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return body ? `${subject}\n\n${body}` : subject;
}

function stripWrappingQuotes(s) {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Split an existing COMMIT_EDITMSG body into the user's content and the
 * trailing comment block, treating a "diff" scissors line (`# ------`) and
 * everything after it as comments too.
 *
 * @param {string} fileContent
 * @returns {{ userContent: string, comments: string }}
 */
export function splitCommitFile(fileContent) {
  const lines = (fileContent ?? "").replace(/\r\n/g, "\n").split("\n");

  // Find the first comment line; from there to the end is git's block.
  let firstComment = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#")) {
      firstComment = i;
      break;
    }
  }

  if (firstComment === -1) {
    return { userContent: lines.join("\n").trim(), comments: "" };
  }

  const userContent = lines.slice(0, firstComment).join("\n").trim();
  const comments = lines.slice(firstComment).join("\n");
  return { userContent, comments };
}

/**
 * Does the user already have real (non-comment, non-empty) content?
 *
 * @param {string} fileContent
 * @returns {boolean}
 */
export function hasUserMessage(fileContent) {
  return splitCommitFile(fileContent).userContent.length > 0;
}

/**
 * Merge a generated message into the existing commit file content.
 *
 * Crucially: the generated subject/body goes ABOVE git's comment block, and
 * the comment block is preserved verbatim. If the user already wrote a
 * message we return the file unchanged (caller decides, but this is the safe
 * default that prevents the "hook ate my -m message" bug).
 *
 * @param {string} fileContent  current COMMIT_EDITMSG content
 * @param {string} generated    cleaned message from sanitizeMessage
 * @param {object} [opts]
 * @param {boolean} [opts.force]  overwrite even if the user wrote something
 * @returns {string} new file content to write back
 */
export function mergeIntoCommitFile(fileContent, generated, opts = {}) {
  const { userContent, comments } = splitCommitFile(fileContent);

  if (userContent && !opts.force) {
    return fileContent; // never clobber a user-authored message
  }

  const parts = [generated.trim()];
  if (comments) {
    parts.push(""); // blank line between message and git's comments
    parts.push(comments.replace(/\n+$/, ""));
  }
  // Trailing newline keeps git and editors happy.
  return parts.join("\n") + "\n";
}
