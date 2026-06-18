import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDiff, summarizeStats } from "../src/core/diff-parser.js";

test("parseDiff returns empty array for empty or blank input", () => {
  assert.deepEqual(parseDiff(""), []);
  assert.deepEqual(parseDiff("   \n  "), []);
  assert.deepEqual(parseDiff(null), []);
});

test("parseDiff detects an added file and counts lines", () => {
  const diff = `diff --git a/new.js b/new.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/new.js
@@ -0,0 +1,3 @@
+const a = 1;
+const b = 2;
+export { a, b };`;
  const [f] = parseDiff(diff);
  assert.equal(f.path, "new.js");
  assert.equal(f.status, "added");
  assert.equal(f.added, 3);
  assert.equal(f.removed, 0);
  assert.equal(f.binary, false);
});

test("parseDiff detects a deleted file", () => {
  const diff = `diff --git a/old.js b/old.js
deleted file mode 100644
index abc1234..0000000
--- a/old.js
+++ /dev/null
@@ -1,2 +0,0 @@
-const gone = true;
-export default gone;`;
  const [f] = parseDiff(diff);
  assert.equal(f.status, "deleted");
  assert.equal(f.removed, 2);
  assert.equal(f.added, 0);
});

test("parseDiff detects a modification with adds and removes", () => {
  const diff = `diff --git a/mod.js b/mod.js
index 1111111..2222222 100644
--- a/mod.js
+++ b/mod.js
@@ -1,4 +1,4 @@
 const keep = 1;
-const old = 2;
+const renewed = 2;
 const alsoKeep = 3;`;
  const [f] = parseDiff(diff);
  assert.equal(f.status, "modified");
  assert.equal(f.added, 1);
  assert.equal(f.removed, 1);
  // context lines are captured but not counted as add/remove
  const ctx = f.hunks[0].lines.filter((l) => l.kind === "ctx");
  assert.equal(ctx.length, 2);
});

test("parseDiff detects a rename and records both paths", () => {
  const diff = `diff --git a/src/old-name.js b/src/new-name.js
similarity index 96%
rename from src/old-name.js
rename to src/new-name.js
index 1111111..2222222 100644
--- a/src/old-name.js
+++ b/src/new-name.js
@@ -1,2 +1,2 @@
-// old
+// new
 const x = 1;`;
  const [f] = parseDiff(diff);
  assert.equal(f.status, "renamed");
  assert.equal(f.oldPath, "src/old-name.js");
  assert.equal(f.path, "src/new-name.js");
});

test("parseDiff flags a binary file", () => {
  const diff = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..abc1234
Binary files /dev/null and b/logo.png differ`;
  const [f] = parseDiff(diff);
  assert.equal(f.binary, true);
  assert.equal(f.status, "added");
});

test("parseDiff handles multiple files in one diff", () => {
  const diff = `diff --git a/a.js b/a.js
index 1..2 100644
--- a/a.js
+++ b/a.js
@@ -1 +1 @@
-1
+2
diff --git a/b.js b/b.js
index 1..2 100644
--- a/b.js
+++ b/b.js
@@ -1 +1,2 @@
 keep
+added`;
  const files = parseDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "a.js");
  assert.equal(files[1].path, "b.js");
});

test("summarizeStats aggregates counts and statuses", () => {
  const diff = `diff --git a/new.js b/new.js
new file mode 100644
--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+a
+b
diff --git a/mod.js b/mod.js
index 1..2 100644
--- a/mod.js
+++ b/mod.js
@@ -1,2 +1,2 @@
-x
+y
 z`;
  const stats = summarizeStats(parseDiff(diff));
  assert.equal(stats.files, 2);
  assert.equal(stats.added, 3);
  assert.equal(stats.removed, 1);
  assert.equal(stats.byStatus.added, 1);
  assert.equal(stats.byStatus.modified, 1);
});
