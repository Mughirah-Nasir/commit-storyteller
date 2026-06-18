import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDiff } from "../src/core/diff-parser.js";
import { offlineSummary } from "../src/core/summarizer.js";

const mkFile = (path, { added = 1, removed = 0, status = "modified" } = {}) => {
  const head =
    status === "added"
      ? `new file mode 100644\n--- /dev/null\n+++ b/${path}`
      : status === "deleted"
        ? `deleted file mode 100644\n--- a/${path}\n+++ /dev/null`
        : `index 1..2 100644\n--- a/${path}\n+++ b/${path}`;
  const adds = Array.from({ length: added }, (_, i) => `+a${i}`).join("\n");
  const rems = Array.from({ length: removed }, (_, i) => `-r${i}`).join("\n");
  const bodyLines = [adds, rems].filter(Boolean).join("\n");
  return `diff --git a/${path} b/${path}\n${head}\n@@ -1,${removed || 1} +1,${added || 1} @@\n${bodyLines}`;
};

test("single added file yields a feat with add verb", () => {
  const files = parseDiff(mkFile("src/feature/widget.js", { added: 20, status: "added" }));
  const { subject } = offlineSummary(files);
  assert.match(subject, /^feat/);
  assert.match(subject, /add widget\.js/);
});

test("docs-only change is typed docs", () => {
  const files = parseDiff(mkFile("README.md", { added: 5 }));
  const { subject } = offlineSummary(files);
  assert.match(subject, /^docs/);
});

test("test-only change is typed test", () => {
  const files = parseDiff(mkFile("test/thing.test.js", { added: 8, status: "added" }));
  const { subject } = offlineSummary(files);
  assert.match(subject, /^test/);
});

test("CI workflow change is typed ci", () => {
  const files = parseDiff(mkFile(".github/workflows/ci.yml", { added: 3 }));
  const { subject } = offlineSummary(files);
  assert.match(subject, /^ci/);
});

test("large net-add across a module yields feat with that scope", () => {
  const diff =
    mkFile("src/payments/charge.js", { added: 40 }) +
    "\n" +
    mkFile("src/payments/refund.js", { added: 30 });
  const { subject } = offlineSummary(parseDiff(diff));
  assert.match(subject, /^feat\(payments\)/);
});

test("mostly-deletions change is typed refactor", () => {
  const files = parseDiff(
    mkFile("src/legacy.js", { added: 2, removed: 40, status: "modified" }),
  );
  const { subject } = offlineSummary(files);
  assert.match(subject, /^refactor/);
});

test("small surgical change is typed fix", () => {
  const files = parseDiff(mkFile("src/util.js", { added: 2, removed: 1 }));
  const { subject } = offlineSummary(files);
  assert.match(subject, /^fix/);
});

test("prose style drops the type prefix and capitalises", () => {
  const files = parseDiff(mkFile("src/feature/widget.js", { added: 20, status: "added" }));
  const { subject } = offlineSummary(files, { style: "prose" });
  assert.ok(!/^(feat|fix|docs|refactor)/.test(subject));
  assert.equal(subject[0], subject[0].toUpperCase());
});

test("multi-file change produces a body listing files", () => {
  const diff = mkFile("src/a.js", { added: 5 }) + "\n" + mkFile("src/b.js", { added: 5 });
  const { body } = offlineSummary(parseDiff(diff));
  assert.match(body, /- update src\/a\.js/);
  assert.match(body, /- update src\/b\.js/);
});

test("rename is described with both names", () => {
  const diff = `diff --git a/src/old.js b/src/new.js
similarity index 95%
rename from src/old.js
rename to src/new.js
index 1..2 100644
--- a/src/old.js
+++ b/src/new.js
@@ -1 +1 @@
-a
+b`;
  const { subject } = offlineSummary(parseDiff(diff));
  assert.match(subject, /rename old\.js to new\.js/);
});

test("offline summary is deterministic for the same input", () => {
  const files = parseDiff(mkFile("src/x.js", { added: 10, removed: 3 }));
  const a = offlineSummary(files);
  const b = offlineSummary(files);
  assert.deepEqual(a, b);
});
