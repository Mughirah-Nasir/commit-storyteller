/**
 * Configuration resolution.
 *
 * Precedence (lowest to highest):
 *   1. Built-in defaults
 *   2. A `.storytellerrc.json` file (searched from cwd upward to repo root)
 *   3. Environment variables (STORYTELLER_*) and standard provider key vars
 *
 * Resolution is pure given its inputs (file contents + env object are passed
 * in by `loadConfig`), so the merge logic is fully unit-testable.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, parse as parsePath } from "node:path";

export const DEFAULT_CONFIG = {
  provider: "offline", // offline | anthropic | openai | ollama
  style: "conventional", // conventional | prose
  model: null, // null = provider's own default
  maxTokens: 400,
  timeoutMs: 20000,
  budget: 12000, // diff character budget for the prompt
  hook: "prepare-commit-msg", // prepare-commit-msg | post-commit
  fallbackToOffline: true, // if the LLM call fails, use the offline engine
  overwriteUserMessage: false, // never clobber a typed message by default
};

const RC_FILENAME = ".storytellerrc.json";

/**
 * Walk from `startDir` up to the filesystem root looking for the rc file.
 *
 * @param {string} startDir
 * @returns {string|null} absolute path or null
 */
export function findConfigFile(startDir) {
  let dir = startDir;
  const { root } = parsePath(dir);
  // Guard against symlink loops with a generous depth cap.
  for (let i = 0; i < 64; i++) {
    const candidate = join(dir, RC_FILENAME);
    if (existsSync(candidate)) return candidate;
    if (dir === root) break;
    dir = dirname(dir);
  }
  return null;
}

/**
 * Merge env-derived overrides on top of a base config.
 *
 * @param {object} base
 * @param {Record<string,string|undefined>} env
 */
export function applyEnvOverrides(base, env) {
  const out = { ...base };

  if (env.STORYTELLER_PROVIDER) out.provider = env.STORYTELLER_PROVIDER;
  if (env.STORYTELLER_STYLE) out.style = env.STORYTELLER_STYLE;
  if (env.STORYTELLER_MODEL) out.model = env.STORYTELLER_MODEL;
  if (env.STORYTELLER_HOOK) out.hook = env.STORYTELLER_HOOK;
  if (env.STORYTELLER_BUDGET) {
    const n = Number(env.STORYTELLER_BUDGET);
    if (Number.isFinite(n) && n > 0) out.budget = n;
  }
  if (env.STORYTELLER_TIMEOUT_MS) {
    const n = Number(env.STORYTELLER_TIMEOUT_MS);
    if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
  }
  if (env.STORYTELLER_NO_FALLBACK === "1") out.fallbackToOffline = false;

  // Provider keys / endpoints are kept separate from the persisted config so
  // they never get written to a file by accident.
  out.keys = {
    anthropic: env.ANTHROPIC_API_KEY ?? null,
    openai: env.OPENAI_API_KEY ?? null,
    openaiBaseUrl: env.OPENAI_BASE_URL ?? null,
    ollamaBaseUrl: env.OLLAMA_HOST ?? null,
  };

  return out;
}

/**
 * Validate and normalise a merged config, throwing on clearly invalid values.
 *
 * @param {object} cfg
 */
export function validateConfig(cfg) {
  const providers = ["offline", "anthropic", "openai", "ollama"];
  if (!providers.includes(cfg.provider)) {
    throw new Error(
      `invalid provider "${cfg.provider}" (expected one of: ${providers.join(", ")})`,
    );
  }
  const styles = ["conventional", "prose"];
  if (!styles.includes(cfg.style)) {
    throw new Error(`invalid style "${cfg.style}" (expected: ${styles.join(", ")})`);
  }
  const hooks = ["prepare-commit-msg", "post-commit"];
  if (!hooks.includes(cfg.hook)) {
    throw new Error(`invalid hook "${cfg.hook}" (expected: ${hooks.join(", ")})`);
  }
  return cfg;
}

/**
 * Load the effective configuration.
 *
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {Record<string,string|undefined>} [opts.env]
 * @returns {object} validated config (with a non-enumerable `_source`)
 */
export function loadConfig(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;

  let fileConfig = {};
  let source = "defaults";
  const file = findConfigFile(cwd);
  if (file) {
    try {
      fileConfig = JSON.parse(readFileSync(file, "utf8"));
      source = file;
    } catch (err) {
      throw new Error(`could not parse ${file}: ${err.message}`);
    }
  }

  const merged = applyEnvOverrides({ ...DEFAULT_CONFIG, ...fileConfig }, env);
  validateConfig(merged);
  Object.defineProperty(merged, "_source", { value: source, enumerable: false });
  return merged;
}
