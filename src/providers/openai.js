/**
 * OpenAI provider.
 *
 * Uses the Chat Completions API, which is also what most OpenAI-compatible
 * gateways speak, so `baseUrl` can be pointed at a compatible endpoint.
 */

import { ProviderError, withTimeout } from "./base.js";

export class OpenAIProvider {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} [opts.model]
   * @param {string} [opts.baseUrl]
   * @param {number} [opts.maxTokens]
   * @param {number} [opts.timeoutMs]
   * @param {typeof fetch} [opts.fetchImpl]
   */
  constructor(opts) {
    if (!opts?.apiKey) throw new ProviderError("OpenAI: missing API key");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gpt-4o-mini";
    this.baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.maxTokens = opts.maxTokens ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.name = "openai";
  }

  async generate({ system, user }) {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };

    const res = await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        }),
      this.timeoutMs,
    ).catch((err) => {
      throw new ProviderError(`OpenAI request failed: ${err.message}`, {
        cause: err,
        retryable: true,
      });
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new ProviderError(`OpenAI returned ${res.status}: ${detail}`, {
        retryable: res.status >= 500 || res.status === 429,
      });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new ProviderError("OpenAI returned an empty message");
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
