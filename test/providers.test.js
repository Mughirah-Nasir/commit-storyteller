import { test } from "node:test";
import assert from "node:assert/strict";

import { AnthropicProvider } from "../src/providers/anthropic.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OllamaProvider } from "../src/providers/ollama.js";
import { FakeProvider, ProviderError } from "../src/providers/base.js";
import { createProvider } from "../src/providers/factory.js";
import { parseDiff } from "../src/core/diff-parser.js";

const okJson = (body) => ({
  ok: true,
  status: 200,
  async json() {
    return body;
  },
  async text() {
    return JSON.stringify(body);
  },
});

const errStatus = (status, text = "boom") => ({
  ok: false,
  status,
  async json() {
    return {};
  },
  async text() {
    return text;
  },
});

// --- Anthropic ---------------------------------------------------------------

test("AnthropicProvider sends the key header and parses text blocks", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return okJson({ content: [{ type: "text", text: "feat: hi" }] });
  };
  const p = new AnthropicProvider({ apiKey: "test-anthropic-key", fetchImpl });
  const out = await p.generate({ system: "s", user: "u" });
  assert.equal(out, "feat: hi");
  assert.equal(seen.init.headers["x-api-key"], "test-anthropic-key");
  assert.ok(seen.url.includes("/v1/messages"));
});

test("AnthropicProvider throws without a key", () => {
  assert.throws(() => new AnthropicProvider({}), ProviderError);
});

test("AnthropicProvider marks 429/5xx as retryable", async () => {
  const fetchImpl = async () => errStatus(429);
  const p = new AnthropicProvider({ apiKey: "k", fetchImpl });
  await assert.rejects(p.generate({ system: "s", user: "u" }), (e) => {
    assert.ok(e instanceof ProviderError);
    assert.equal(e.retryable, true);
    return true;
  });
});

// --- OpenAI ------------------------------------------------------------------

test("OpenAIProvider parses chat completion content", async () => {
  const fetchImpl = async () => okJson({ choices: [{ message: { content: "fix: thing" } }] });
  const p = new OpenAIProvider({ apiKey: "test-openai-key", fetchImpl });
  assert.equal(await p.generate({ system: "s", user: "u" }), "fix: thing");
});

test("OpenAIProvider honours a custom baseUrl", async () => {
  let seenUrl;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return okJson({ choices: [{ message: { content: "x" } }] });
  };
  const p = new OpenAIProvider({
    apiKey: "test-openai-key",
    baseUrl: "https://gw.local/v1/",
    fetchImpl,
  });
  await p.generate({ system: "s", user: "u" });
  assert.equal(seenUrl, "https://gw.local/v1/chat/completions");
});

// --- Ollama ------------------------------------------------------------------

test("OllamaProvider parses a chat response and needs no key", async () => {
  const fetchImpl = async () => okJson({ message: { content: "chore: local" } });
  const p = new OllamaProvider({ fetchImpl });
  assert.equal(await p.generate({ system: "s", user: "u" }), "chore: local");
});

test("OllamaProvider surfaces a helpful error when the daemon is unreachable", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const p = new OllamaProvider({ fetchImpl });
  await assert.rejects(p.generate({ system: "s", user: "u" }), /daemon running/);
});

// --- FakeProvider ------------------------------------------------------------

test("FakeProvider produces a message from the diff with no network", async () => {
  const files = parseDiff(`diff --git a/src/x.js b/src/x.js
new file mode 100644
--- /dev/null
+++ b/src/x.js
@@ -0,0 +1,20 @@
${Array.from({ length: 20 }, (_, i) => "+l" + i).join("\n")}`);
  const p = new FakeProvider({ files });
  const out = await p.generate({ system: "s", user: "u" });
  assert.match(out, /^(feat|fix|refactor|chore|docs|test|build|ci|style)/);
});

// --- factory -----------------------------------------------------------------

test("factory returns the offline provider for provider=offline", () => {
  const { provider, isOffline } = createProvider(
    { provider: "offline", style: "conventional", keys: {} },
    [],
  );
  assert.ok(provider instanceof FakeProvider);
  assert.equal(isOffline, true);
});

test("factory throws a clear error when an API key is missing", () => {
  assert.throws(
    () => createProvider({ provider: "anthropic", style: "conventional", keys: {} }, []),
    /needs ANTHROPIC_API_KEY/,
  );
  assert.throws(
    () => createProvider({ provider: "openai", style: "conventional", keys: {} }, []),
    /needs OPENAI_API_KEY/,
  );
});

test("factory builds ollama without a key", () => {
  const { isOffline } = createProvider(
    { provider: "ollama", style: "conventional", keys: {} },
    [],
  );
  assert.equal(isOffline, false);
});
