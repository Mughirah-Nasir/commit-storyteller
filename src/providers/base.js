/**
 * Provider abstraction (Strategy pattern).
 *
 * Every provider exposes the same async method:
 *
 *     async generate({ system, user, signal }) -> string
 *
 * The hook does not know or care which provider it is talking to. This makes
 * the tool vendor-agnostic and -- importantly -- lets the whole pipeline be
 * tested offline with `FakeProvider`, which is also the real no-API-key
 * experience.
 */

import { offlineSummary } from "../core/summarizer.js";

export class ProviderError extends Error {
  constructor(message, { cause, retryable = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.cause = cause;
    this.retryable = retryable;
  }
}

/**
 * Race a promise against a timeout, aborting via AbortController.
 *
 * @param {(signal: AbortSignal) => Promise<any>} fn
 * @param {number} ms
 */
export async function withTimeout(fn, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The offline provider. It ignores the prompt text and instead runs the
 * deterministic summarizer over the parsed diff it is constructed with.
 *
 * Why hold the parsed diff rather than parse the prompt? Because the offline
 * engine works on structured data, and re-parsing our own prompt string
 * would be fragile. The factory wires the real diff in.
 */
export class FakeProvider {
  /**
   * @param {object} [opts]
   * @param {Array<object>} [opts.files]   parsed diff to summarise
   * @param {'conventional'|'prose'} [opts.style]
   */
  constructor(opts = {}) {
    this.files = opts.files ?? [];
    this.style = opts.style ?? "conventional";
    this.name = "offline";
  }

  async generate(_prompt) {
    const { subject, body } = offlineSummary(this.files, { style: this.style });
    return body ? `${subject}\n\n${body}` : subject;
  }
}
