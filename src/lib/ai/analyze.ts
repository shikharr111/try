import { assessActions, type AssessedAction } from "./assess";
import { buildPrompt } from "./prompt";
import { reconcile } from "./reconcile";
import { PROMPT_VERSION, validateAnalysis, type AnalysisResult } from "./schema";
import type { MetricSnapshot } from "./snapshot";

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens: number;
}
export interface LLMResponse {
  text: string;
  model: string;
}
/** Provider-agnostic seam: the real client lives in client.ts, tests use a fake. */
export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

export type StoredAnalysis = Omit<AnalysisResult, "recommended_actions"> & { recommended_actions: AssessedAction[] };

export type AnalysisOutcome =
  | { status: "completed"; result: StoredAnalysis; warnings: string[]; model: string; promptVersion: string; attempts: number }
  | { status: "failed"; error: string; model: string; promptVersion: string; attempts: number };

/** Extract a JSON object from model text, tolerating code fences or stray prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError("Response did not contain a JSON object");
  }
}

export async function runAnalysis(
  client: LLMClient,
  snapshot: MetricSnapshot,
  opts: { maxAttempts?: number; maxTokens?: number } = {},
): Promise<AnalysisOutcome> {
  const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 2, 3));
  let errors: string[] | undefined;
  let model = "unknown";
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildPrompt(snapshot, errors);
    let text: string;
    try {
      const res = await client.complete({ system: prompt.system, user: prompt.user, maxTokens: opts.maxTokens ?? 6000 });
      text = res.text;
      model = res.model;
    } catch (e) {
      // Never forward provider error bodies: they can echo request headers or content.
      const kind = e instanceof Error ? e.name : "Error";
      return { status: "failed", error: `The AI service request failed (${kind}). Try again later.`, model, promptVersion: PROMPT_VERSION, attempts };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch {
      errors = ["Reply was not valid JSON."];
      continue;
    }
    const validated = validateAnalysis(parsed);
    if (!validated.ok) {
      errors = validated.errors;
      continue;
    }
    const { value, warnings } = reconcile(validated.value, snapshot);
    const result: StoredAnalysis = { ...value, recommended_actions: assessActions(value.recommended_actions, snapshot) };
    return { status: "completed", result, warnings, model, promptVersion: PROMPT_VERSION, attempts };
  }
  return {
    status: "failed",
    error: `The AI reply could not be validated after ${attempts} attempt(s): ${(errors ?? []).slice(0, 5).join("; ")}`,
    model,
    promptVersion: PROMPT_VERSION,
    attempts,
  };
}
