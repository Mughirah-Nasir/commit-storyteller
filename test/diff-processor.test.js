import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDiff } from "../src/core/diff-parser.js";
import { processDiff, isNoiseFile } from "../src/core/diff-processor.js";

test("isNoiseFile recognises lockfiles, minified and vendored output", () => {
  assert.ok(isNoiseFile("package-lock.json"));
  assert.ok(isNoiseFile("frontend/yarn.lock"));
  assert.ok(isNoiseFile("app.min.js"));
  assert.ok(isNoiseFile("dist/bundle.js"));
  assert.ok(isNoiseFile("assets/logo.png"));
  assert.ok(!isNoiseFile("src/index.js"));
  assert.ok(!isNoiseFile("README.md"));
});

test("processDiff collapses a noise file to a header-only line", () => {
  const diff = `diff --git a/package-lock.json b/package-lock.json
index 1..2 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
-  "version": "1.0.0",
+  "version": "1.0.1",
 {}`;
  const out = processDiff(parseDiff(diff));
  assert.ok(out.text.includes("package-lock.json"));
  assert.ok(out.text.includes("content omitted"));
  // none of the actual lockfile line content should be present
  assert.ok(!out.text.includes('"version": "1.0.1"'));
  assert.equal(out.omitted, 1);
  assert.equal(out.included, 0);
});

test("processDiff keeps real source content", () => {
  const diff = `diff --git a/src/x.js b/src/x.js
index 1..2 100644
--- a/src/x.js
+++ b/src/x.js
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;`;
  const out = processDiff(parseDiff(diff));
  assert.ok(out.text.includes("+ const b = 2;"));
  assert.equal(out.included, 1);
  assert.equal(out.truncated, false);
});

test("processDiff truncates when over budget and flags it", () => {
  // Build two files; a tiny budget forces the second to header-only.
  const big = (name, n) => {
    const body = Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n");
    return `diff --git a/${name} b/${name}
new file mode 100644
--- /dev/null
+++ b/${name}
@@ -0,0 +1,${n} @@
${body}`;
  };
  const diff = big("src/first.js", 50) + "\n" + big("src/second.js", 50);
  const out = processDiff(parseDiff(diff), { budget: 200 });
  assert.equal(out.truncated, true);
  assert.ok(out.included >= 1);
  assert.ok(out.omitted >= 1);
});

test("processDiff caps a single huge file at the per-file line cap", () => {
  const n = 500;
  const body = Array.from({ length: n }, (_, i) => `+line ${i}`).join("\n");
  const diff = `diff --git a/src/huge.js b/src/huge.js
new file mode 100644
--- /dev/null
+++ b/src/huge.js
@@ -0,0 +1,${n} @@
${body}`;
  const out = processDiff(parseDiff(diff), { budget: 1_000_000 });
  assert.ok(out.text.includes("change truncated at"));
});

test("processDiff orders informative source above noise", () => {
  const src = `diff --git a/src/logic.js b/src/logic.js
index 1..2 100644
--- a/src/logic.js
+++ b/src/logic.js
@@ -1 +1,2 @@
 keep
+real change`;
  const lock = `diff --git a/package-lock.json b/package-lock.json
index 1..2 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1,2 @@
 {}
+noise`;
  // noise first in input; processor should still rank source first
  const out = processDiff(parseDiff(lock + "\n" + src));
  const srcIdx = out.text.indexOf("logic.js");
  const lockIdx = out.text.indexOf("package-lock.json");
  assert.ok(srcIdx < lockIdx, "source should be rendered before noise");
});
