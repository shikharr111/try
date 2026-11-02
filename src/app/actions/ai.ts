"use server";
import { revalidatePath } from "next/cache";
import { AnthropicClient, LLMError } from "@/lib/ai/client";
import { runAnalysis, type StoredAnalysis } from "@/lib/ai/analyze";
import { PROMPT_VERSION } from "@/lib/ai/schema";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { aiConfig } from "@/lib/server/env";
import { getProjectContext, isUuid } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";
import { collectSnapshot } from "@/lib/server/ai-service";

/**
 * AI delay analysis. Advisory only: the model sees a deterministic snapshot, its output is schema-validated and
 * reconciled against that snapshot, and nothing it says changes plans, dates or baselines. The API key is read
 * server-side only and is never sent to the browser. UNVERIFIED against the live provider API.
 */
const back = (p: string) => `/projects/${p}/ai`;

export async function runDelayAnalysis(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!isUuid(projectId)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase, user, project, access } = await getProjectContext(projectId);
  if (!access.runAiAnalysis) redirectWith(back(projectId), "err", "Only project managers and organization admins can run AI analysis.");
  const cfg = aiConfig();
  if (!cfg) redirectWith(back(projectId), "err", "AI analysis is not configured on this deployment (set ANTHROPIC_API_KEY and AI_MODEL).");

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase.from("ai_analyses").select("id", { count: "exact", head: true }).eq("project_id", projectId).gte("created_at", since);
  if ((count ?? 0) >= cfg.dailyLimit) redirectWith(back(projectId), "err", `Daily AI analysis limit reached for this project (${cfg.dailyLimit} per 24 hours).`);

  // Optional "as of" date: analyse the project as it stood on that day (never in the future, never trusted blindly).
  const asofRaw = String(formData.get("asof") ?? "").trim();
  const asof = /^\d{4}-\d{2}-\d{2}$/.test(asofRaw) ? asofRaw : null;
  const bundle = await loadProjectBundle(supabase, project, asof);
  if (asof && asof > bundle.today) redirectWith(back(projectId), "err", "The analysis date cannot be in the future.");
  if (bundle.baseline.length === 0) redirectWith(back(projectId), "err", "An approved baseline is required before analysis.");
  const snapshot = await collectSnapshot(supabase, bundle);

  let client: AnthropicClient;
  try { client = new AnthropicClient({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl }); }
  catch (e) { redirectWith(back(projectId), "err", e instanceof LLMError ? e.message : "AI is not configured."); }

  const outcome = await runAnalysis(client, snapshot);
  const base = { project_id: projectId, requested_by: user.id, cutoff_date: bundle.cutoff, model: outcome.model, prompt_version: outcome.promptVersion || PROMPT_VERSION, metric_snapshot: snapshot };
  const { error } = outcome.status === "completed"
    ? await supabase.from("ai_analyses").insert({ ...base, status: "completed", result: { ...outcome.result, _warnings: outcome.warnings } })
    : await supabase.from("ai_analyses").insert({ ...base, status: "failed", result: null, error: outcome.error.slice(0, 500) });
  revalidatePath(back(projectId));
  if (error) redirectWith(back(projectId), "err", friendlyDbError(error));
  redirectWith(back(projectId), outcome.status === "completed" ? "ok" : "err", outcome.status === "completed" ? "Analysis complete. It is advisory: review the evidence before acting." : `Analysis failed: ${outcome.error}`);
}

/** Turns selected AI-suggested actions into a PROPOSED recovery plan. Nothing is applied automatically. */
export async function createRecoveryPlan(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const analysisId = String(formData.get("analysis_id") ?? "");
  if (!isUuid(projectId) || !isUuid(analysisId)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase, user, access } = await getProjectContext(projectId);
  if (!access.runAiAnalysis) redirectWith(back(projectId), "err", "Only managers can create recovery plans.");
  const r = new FormReader(formData);
  const title = r.text("title", "Title", { required: true, max: 160 });
  const picked = new Set(formData.getAll("action_id").map(String));
  if (!r.ok) redirectWith(back(projectId), "err", Object.values(r.errors)[0]);
  if (picked.size === 0) redirectWith(back(projectId), "err", "Select at least one action.");
  const { data: a } = await supabase.from("ai_analyses").select("result").eq("id", analysisId).eq("project_id", projectId).maybeSingle();
  const actions = ((a?.result as StoredAnalysis | null)?.recommended_actions ?? []).filter((x) => picked.has(x.id));
  if (actions.length === 0) redirectWith(back(projectId), "err", "Selected actions were not found in that analysis.");
  const { error } = await supabase.from("recovery_plans").insert({ project_id: projectId, ai_analysis_id: analysisId, title, actions, created_by: user.id });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Recovery plan proposed. A manager decision is recorded when it is approved or rejected.");
}

export async function decideRecoveryPlan(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(projectId) || !isUuid(planId)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase, access } = await getProjectContext(projectId);
  if (!access.review) redirectWith(back(projectId), "err", "Only managers can approve or reject recovery plans.");
  const r = new FormReader(formData);
  const status = r.enumValue("status", "Decision", ["approved", "rejected"] as const);
  const notes = r.optionalText("notes", "Notes", 1000);
  if (!status) redirectWith(back(projectId), "err", "Choose a decision.");
  const { error } = await supabase.from("recovery_plans").update({ status, decision_notes: notes }).eq("id", planId).eq("project_id", projectId);
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : status === "approved" ? "Plan approved. This records your decision only; update the baseline separately if the plan changes dates." : "Plan rejected.");
}
