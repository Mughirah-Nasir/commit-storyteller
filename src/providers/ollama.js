/**
 * Ollama provider -- talks to a locally running Ollama daemon.
 *
 * No API key: this is the "privacy-first, runs on your machine" option.
 * Defaults to http://127.0.0.1:11434 and uses the /api/chat endpoint with
 * streaming disabled so we get a single JSON response.
 */

import { ProviderError, withTimeout } from "./base.js";

export class OllamaProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {string} [opts.baseUrl]
   * @param {number} [opts.timeoutMs]
   * @param {typeof fetch} [opts.fetchImpl]
   */
  constructor(opts = {}) {
    this.model = opts.model ?? "llama3.2";
    this.baseUrl = (opts.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
    // Local models can be slow on first load, so the default timeout is longer.
    this.timeoutMs = opts.timeoutMs ?? 60000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.name = "ollama";
  }

  async generate({ system, user }) {
    const body = {
      model: this.model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };

    const res = await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/api/chat`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      this.timeoutMs,
    ).catch((err) => {
      throw new ProviderError(
        `Ollama request failed (is the daemon running at ${this.baseUrl}?): ${err.message}`,
        { cause: err, retryable: true },
      );
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new ProviderError(`Ollama returned ${res.status}: ${detail}`, {
        retryable: res.status >= 500,
      });
    }

    const data = await res.json();
    const text = data?.message?.content?.trim() ?? "";
    if (!text) throw new ProviderError("Ollama returned an empty message");
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
