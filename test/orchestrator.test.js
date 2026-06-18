import { test } from "node:test";
import assert from "node:assert/strict";

import { generateMessage } from "../src/core/orchestrator.js";

const cfg = (over = {}) => ({
  provider: "offline",
  style: "conventional",
  model: null,
  maxTokens: 400,
  timeoutMs: 1000,
  budget: 12000,
  hook: "prepare-commit-msg",
  fallbackToOffline: true,
  overwriteUserMessage: false,
  keys: {},
  ...over,
});

const SAMPLE_DIFF = `diff --git a/src/auth/login.js b/src/auth/login.js
index 1..2 100644
--- a/src/auth/login.js
+++ b/src/auth/login.js
@@ -1,3 +1,6 @@
+function validate(token) {
+  if (!token) throw new Error('no token');
+}
 export function login() {}`;

test("empty diff yields no message and does not error", async () => {
  const r = await generateMessage({ diff: "", config: cfg() });
  assert.equal(r.message, "");
  assert.equal(r.usedProvider, "none");
  assert.equal(r.meta.empty, true);
});

test("offline provider returns a clean conventional message", async () => {
  const r = await generateMessage({
    diff: SAMPLE_DIFF,
    branch: "feature/auth",
    config: cfg(),
  });
  assert.ok(r.message.length > 0);
  assert.equal(r.usedProvider, "offline");
  assert.equal(r.fellBack, false);
  assert.match(r.message.split("\n")[0], /^(feat|fix|refactor|chore)/);
});

test("a working remote provider's output is used and sanitized", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        content: [{ type: "text", text: "```\nfeat(auth): validate login token\n```" }],
      };
    },
    async text() {
      return "";
    },
  });
  const r = await generateMessage(
    { diff: SAMPLE_DIFF, config: cfg({ provider: "anthropic", keys: { anthropic: "k" } }) },
    { fetchImpl },
  );
  assert.equal(r.usedProvider, "anthropic");
  assert.equal(r.fellBack, false);
  // fence stripped by the sanitizer
  assert.equal(r.message, "feat(auth): validate login token");
});

test("a failing remote provider falls back to the offline engine", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    async json() {
      return {};
    },
    async text() {
      return "server error";
    },
  });
  const r = await generateMessage(
    { diff: SAMPLE_DIFF, config: cfg({ provider: "openai", keys: { openai: "k" } }) },
    { fetchImpl },
  );
  assert.equal(r.fellBack, true);
  assert.equal(r.usedProvider, "openai"); // the configured provider that failed
  assert.ok(r.message.length > 0); // but we still got a usable message
  assert.match(r.meta.fallbackReason, /500/);
});

test("with fallback disabled, a remote failure throws cleanly", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  await assert.rejects(
    generateMessage(
      {
        diff: SAMPLE_DIFF,
        config: cfg({ provider: "openai", keys: { openai: "k" }, fallbackToOffline: false }),
      },
      { fetchImpl },
    ),
    /openai failed/,
  );
});

test("prose style is honoured end-to-end via offline engine", async () => {
  const r = await generateMessage({ diff: SAMPLE_DIFF, config: cfg({ style: "prose" }) });
  const subject = r.message.split("\n")[0];
  assert.ok(!/^(feat|fix|refactor|chore)/.test(subject));
});
