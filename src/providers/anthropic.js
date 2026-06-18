/**
 * Anthropic (Claude) provider.
 *
 * Uses the Messages API. The API key is read from the environment by the
 * factory and passed in -- this class never reaches into process.env itself,
 * which keeps it easy to test and free of hidden global state.
 */

import { ProviderError, withTimeout } from "./base.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export class AnthropicProvider {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.model]
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.timeoutMs]
   * @param {typeof fetch} [opts.fetchImpl]  injectable for tests
   */
  constructor(opts) {
    if (!opts?.apiKey) throw new ProviderError("Anthropic: missing API key");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-3-5-haiku-latest";
    this.maxTokens = opts.maxTokens ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.name = "anthropic";
  }

  async generate({ system, user }) {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    };

    const res = await withTimeout(
      (signal) =>
        this.fetchImpl(ENDPOINT, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify(body),
        }),
      this.timeoutMs,
    ).catch((err) => {
      throw new ProviderError(`Anthropic request failed: ${err.message}`, {
        cause: err,
        retryable: true,
      });
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new ProviderError(`Anthropic returned ${res.status}: ${detail}`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }

    const data = await res.json();
    const text = (data?.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) throw new ProviderError("Anthropic returned an empty message");
    return text;
  }
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
