/**
 * Build a provider instance from resolved config.
 *
 * This is the only place that knows how config maps to concrete providers, so
 * the hook and CLI stay decoupled from vendor specifics. The factory also
 * enforces the rule that a missing key for a remote provider is a clear,
 * actionable error rather than a confusing 401 later.
 */

import { FakeProvider } from "./base.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

/**
 * @param {object} cfg            resolved config from loadConfig
 * @param {Array<object>} files   parsed diff (needed by the offline engine)
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]  injectable transport for tests
 * @returns {{ provider: object, isOffline: boolean }}
 */
export function createProvider(cfg, files, deps = {}) {
  const fetchImpl = deps.fetchImpl;
  const keys = cfg.keys ?? {};

  switch (cfg.provider) {
    case "offline":
      return {
        provider: new FakeProvider({ files, style: cfg.style }),
        isOffline: true,
      };

    case "anthropic":
      if (!keys.anthropic) {
        throw new Error("provider 'anthropic' needs ANTHROPIC_API_KEY in the environment");
      }
      return {
        provider: new AnthropicProvider({
          apiKey: keys.anthropic,
          model: cfg.model ?? undefined,
          maxTokens: cfg.maxTokens,
          timeoutMs: cfg.timeoutMs,
          fetchImpl,
        }),
        isOffline: false,
      };

    case "openai":
      if (!keys.openai) {
        throw new Error("provider 'openai' needs OPENAI_API_KEY in the environment");
      }
      return {
        provider: new OpenAIProvider({
          apiKey: keys.openai,
          baseUrl: keys.openaiBaseUrl ?? undefined,
          model: cfg.model ?? undefined,
          maxTokens: cfg.maxTokens,
          timeoutMs: cfg.timeoutMs,
          fetchImpl,
        }),
        isOffline: false,
      };

    case "ollama":
      return {
        provider: new OllamaProvider({
          model: cfg.model ?? undefined,
          baseUrl: keys.ollamaBaseUrl ?? undefined,
          timeoutMs: cfg.timeoutMs,
          fetchImpl,
        }),
        isOffline: false,
      };

    default:
      // validateConfig should have caught this; defensive for safety.
      throw new Error(`unknown provider: ${cfg.provider}`);
  }
}

/**
 * A small offline-summary fallback provider for when a remote call fails.
 *
 * @param {Array<object>} files
 * @param {object} cfg
 */
export function offlineFallback(files, cfg) {
  return new FakeProvider({ files, style: cfg.style });
}
