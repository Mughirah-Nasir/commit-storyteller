import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG,
  applyEnvOverrides,
  validateConfig,
  loadConfig,
} from "../src/core/config.js";

test("defaults select the offline provider and conventional style", () => {
  assert.equal(DEFAULT_CONFIG.provider, "offline");
  assert.equal(DEFAULT_CONFIG.style, "conventional");
  assert.equal(DEFAULT_CONFIG.fallbackToOffline, true);
});

test("env overrides change provider, style and budget", () => {
  const out = applyEnvOverrides(DEFAULT_CONFIG, {
    STORYTELLER_PROVIDER: "openai",
    STORYTELLER_STYLE: "prose",
    STORYTELLER_BUDGET: "5000",
  });
  assert.equal(out.provider, "openai");
  assert.equal(out.style, "prose");
  assert.equal(out.budget, 5000);
});

test("env overrides ignore a non-numeric budget", () => {
  const out = applyEnvOverrides(DEFAULT_CONFIG, { STORYTELLER_BUDGET: "lots" });
  assert.equal(out.budget, DEFAULT_CONFIG.budget);
});

test("provider keys are collected separately and never on the base object", () => {
  const out = applyEnvOverrides(DEFAULT_CONFIG, {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    OPENAI_API_KEY: "test-openai-key",
  });
  assert.equal(out.keys.anthropic, "test-anthropic-key");
  assert.equal(out.keys.openai, "test-openai-key");
  // the persisted-style fields must not carry secrets
  assert.equal(out.apiKey, undefined);
});

test("STORYTELLER_NO_FALLBACK=1 disables the offline safety net", () => {
  const out = applyEnvOverrides(DEFAULT_CONFIG, { STORYTELLER_NO_FALLBACK: "1" });
  assert.equal(out.fallbackToOffline, false);
});

test("validateConfig rejects an unknown provider", () => {
  assert.throws(
    () => validateConfig({ ...DEFAULT_CONFIG, provider: "magic" }),
    /invalid provider/,
  );
});

test("validateConfig rejects an unknown style", () => {
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, style: "haiku" }), /invalid style/);
});

test("validateConfig rejects an unknown hook", () => {
  assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, hook: "pre-push" }), /invalid hook/);
});

test("loadConfig with empty env and root cwd returns pure defaults", () => {
  const cfg = loadConfig({ env: {}, cwd: "/" });
  assert.equal(cfg.provider, "offline");
  assert.equal(cfg._source, "defaults");
});
