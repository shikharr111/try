import type { LLMClient, LLMRequest, LLMResponse } from "./analyze";

/**
 * Server-only Anthropic Messages API client (plain fetch; no SDK dependency).
 * UNVERIFIED against the live API in the build sandbox (no network, no key): covered by the unit tests
 * only through a fake fetch. The API key is passed in by server code; it must never reach the browser.
 */
export class LLMError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "LLMError";
  }
}

export interface AnthropicClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export class AnthropicClient implements LLMClient {
  constructor(private readonly o: AnthropicClientOptions) {
    if (!o.apiKey) throw new LLMError("AI is not configured: ANTHROPIC_API_KEY is missing");
    if (!o.model) throw new LLMError("AI is not configured: AI_MODEL is missing");
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const f = this.o.fetchImpl ?? fetch;
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const retries = this.o.maxRetries ?? 2;
    const url = `${this.o.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 90_000);
      try {
        const res = await f(url, {
          method: "POST",
          signal: ctl.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": this.o.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.o.model,
            max_tokens: req.maxTokens,
            temperature: 0,
            system: req.system,
            messages: [{ role: "user", content: req.user }],
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { model?: string; content?: { type: string; text?: string }[] };
          const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
          if (!text) throw new LLMError("Empty response from AI service");
          return { text, model: body.model ?? this.o.model };
        }
        lastStatus = res.status;
        if (!RETRYABLE.has(res.status) || attempt === retries) {
          // status only: the body may contain request details
          throw new LLMError(`AI service returned HTTP ${res.status}`, res.status);
        }
      } catch (e) {
        if (e instanceof LLMError) throw e;
        if (attempt === retries) throw new LLMError(e instanceof Error && e.name === "AbortError" ? "AI service timed out" : "AI service unreachable", lastStatus);
      } finally {
        clearTimeout(timer);
      }
      await sleep(Math.min(8000, 500 * 2 ** attempt));
    }
    throw new LLMError("AI service request failed", lastStatus);
  }
}
