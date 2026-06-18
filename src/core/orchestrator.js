/**
 * The orchestrator: the one function that runs the whole pipeline.
 *
 *   staged diff -> parse -> build prompt -> provider.generate
 *               -> sanitize -> (fallback to offline if needed)
 *
 * Design guarantee: this function NEVER throws for an operational reason a
 * commit should survive. A failed API call, a timeout, a bad key -- all of
 * these degrade to the offline summary (when enabled) so your commit is never
 * blocked by a flaky network. The only way it returns no message is if the
 * diff is genuinely empty.
 */

import { parseDiff } from "./diff-parser.js";
import { buildPrompt } from "./prompt-builder.js";
import { sanitizeMessage } from "./message.js";
import { createProvider, offlineFallback } from "../providers/factory.js";

/**
 * @param {object} input
 * @param {string} input.diff            raw staged diff
 * @param {string} [input.branch]
 * @param {object} input.config          resolved config
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl]
 * @returns {Promise<{ message: string, usedProvider: string, fellBack: boolean, meta: object }>}
 */
export async function generateMessage(input, deps = {}) {
  const files = parseDiff(input.diff);

  if (files.length === 0) {
    return { message: "", usedProvider: "none", fellBack: false, meta: { empty: true } };
  }

  const cfg = input.config;
  const { system, user, meta } = buildPrompt(files, {
    style: cfg.style,
    budget: cfg.budget,
    branch: input.branch,
  });

  const { provider, isOffline } = createProvider(cfg, files, deps);

  // The offline provider cannot fail; short-circuit without the try/catch
  // dance so its (deterministic) output is returned directly.
  if (isOffline) {
    const raw = await provider.generate({ system, user });
    return {
      message: sanitizeMessage(raw),
      usedProvider: provider.name,
      fellBack: false,
      meta,
    };
  }

  try {
    const raw = await provider.generate({ system, user });
    const message = sanitizeMessage(raw);
    if (!message) throw new Error("provider produced an empty message after cleanup");
    return { message, usedProvider: provider.name, fellBack: false, meta };
  } catch (err) {
    if (!cfg.fallbackToOffline) {
      // Caller explicitly opted out of the safety net; surface a clean error.
      const e = new Error(`commit-storyteller: ${provider.name} failed: ${err.message}`);
      e.providerError = err;
      throw e;
    }
    const fb = offlineFallback(files, cfg);
    const raw = await fb.generate({ system, user });
    return {
      message: sanitizeMessage(raw),
      usedProvider: provider.name,
      fellBack: true,
      meta: { ...meta, fallbackReason: err.message },
    };
  }
}
