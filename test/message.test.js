import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeMessage,
  splitCommitFile,
  hasUserMessage,
  mergeIntoCommitFile,
} from "../src/core/message.js";

// --- sanitizeMessage ---------------------------------------------------------

test("sanitizeMessage trims and returns a plain subject", () => {
  assert.equal(sanitizeMessage("  fix: handle null user  "), "fix: handle null user");
});

test("sanitizeMessage strips a surrounding code fence", () => {
  const raw = "```\nfeat: add login\n\n- token check\n```";
  assert.equal(sanitizeMessage(raw), "feat: add login\n\n- token check");
});

test("sanitizeMessage strips a language-tagged fence", () => {
  const raw = "```text\nfix: thing\n```";
  assert.equal(sanitizeMessage(raw), "fix: thing");
});

test("sanitizeMessage removes a conversational lead-in", () => {
  assert.equal(sanitizeMessage("Here is your commit message: fix: oops"), "fix: oops");
  assert.equal(sanitizeMessage("Sure! fix: oops"), "fix: oops");
});

test("sanitizeMessage strips wrapping quotes and a trailing period", () => {
  assert.equal(sanitizeMessage('"fix: handle edge case."'), "fix: handle edge case");
});

test("sanitizeMessage truncates an over-long subject with an ellipsis", () => {
  const long = "feat: " + "x".repeat(100);
  const out = sanitizeMessage(long);
  const subject = out.split("\n")[0];
  assert.ok(subject.length <= 72);
  assert.ok(subject.endsWith("\u2026"));
});

test("sanitizeMessage collapses excess blank lines in the body", () => {
  const raw = "fix: thing\n\n\n\nbody line";
  assert.equal(sanitizeMessage(raw), "fix: thing\n\nbody line");
});

test("sanitizeMessage returns empty string for empty input", () => {
  assert.equal(sanitizeMessage(""), "");
  assert.equal(sanitizeMessage("   "), "");
});

// --- splitCommitFile ---------------------------------------------------------

test("splitCommitFile separates user content from git comments", () => {
  const content = `my message

# Please enter the commit message for your changes. Lines starting
# with '#' will be ignored, and an empty message aborts the commit.
#
# On branch main`;
  const { userContent, comments } = splitCommitFile(content);
  assert.equal(userContent, "my message");
  assert.ok(comments.startsWith("# Please enter"));
});

test("splitCommitFile returns empty userContent when only comments exist", () => {
  const content = `# Please enter the commit message
# On branch main`;
  const { userContent } = splitCommitFile(content);
  assert.equal(userContent, "");
});

test("hasUserMessage is false for an empty template and true with content", () => {
  assert.equal(hasUserMessage("# just comments\n#\n"), false);
  assert.equal(hasUserMessage("wip\n# comments\n"), true);
  assert.equal(hasUserMessage(""), false);
});

// --- mergeIntoCommitFile (the bug-prone part) --------------------------------

test("merge inserts generated message ABOVE git comments and preserves them", () => {
  const file = `# Please enter the commit message for your changes.
# On branch main
# Changes to be committed:
#   modified:   src/x.js`;
  const merged = mergeIntoCommitFile(file, "fix: handle null");
  const lines = merged.split("\n");
  assert.equal(lines[0], "fix: handle null");
  // comments must still be present, unchanged
  assert.ok(merged.includes("# Please enter the commit message"));
  assert.ok(merged.includes("#   modified:   src/x.js"));
  // a blank line should separate message from comments
  assert.equal(lines[1], "");
  assert.ok(lines[2].startsWith("#"));
});

test("merge does NOT clobber a message the user already typed", () => {
  // This is the regression guard for the original `-m` comment-leak bug:
  // when the user supplied a message, the hook must leave the file untouched.
  const file = `wip: my own message

# Please enter the commit message for your changes.
# On branch main`;
  const merged = mergeIntoCommitFile(file, "feat: generated thing");
  assert.equal(merged, file);
  assert.ok(!merged.includes("feat: generated thing"));
});

test("merge with force overwrites a user message but keeps comments", () => {
  const file = `wip

# On branch main`;
  const merged = mergeIntoCommitFile(file, "feat: real message", { force: true });
  assert.ok(merged.startsWith("feat: real message"));
  assert.ok(merged.includes("# On branch main"));
  assert.ok(!merged.includes("wip"));
});

test("generated message never leaks comment lines back into itself", () => {
  // A model might echo a '#'-prefixed line; after merge those must remain the
  // user's git comments only, not duplicated content from the message body.
  const file = `# On branch main`;
  const generated = "fix: thing\n\n- did the thing";
  const merged = mergeIntoCommitFile(file, generated);
  const hashLines = merged.split("\n").filter((l) => l.startsWith("#"));
  assert.equal(hashLines.length, 1);
  assert.equal(hashLines[0], "# On branch main");
});

test("merge ends the file with a single trailing newline", () => {
  const merged = mergeIntoCommitFile("# c", "fix: x");
  assert.ok(merged.endsWith("\n"));
  assert.ok(!merged.endsWith("\n\n"));
});
