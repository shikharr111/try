import Link from "next/link";
import { Alert, Badge, Card, Empty, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { createRecoveryPlan, decideRecoveryPlan, runDelayAnalysis } from "@/app/actions/ai";
import type { StoredAnalysis } from "@/lib/ai/analyze";
import { CATEGORY_LABELS, fmtDate } from "@/lib/format";
import { aiConfig } from "@/lib/server/env";
import { getProjectContext, isUuid } from "@/lib/server/session";

export const dynamic = "force-dynamic";
/** The model call can take a while (one retry on invalid output); raise the serverless limit on Vercel. */
export const maxDuration = 120;

const CHECK_TONE = { pass: "ok", warn: "warn", unknown: "neutral" } as const;
const CONF_TONE = { high: "ok", medium: "warn", low: "neutral" } as const;

export default async function AiPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project, access } = await getProjectContext(projectId);
  const configured = aiConfig() !== null;

  const [{ data: history }, { data: plans }] = await Promise.all([
    supabase.from("ai_analyses").select("id, created_at, cutoff_date, model, prompt_version, status, error").eq("project_id", project.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("recovery_plans").select("id, title, status, actions, decision_notes, decided_at, created_at, ai_analysis_id").eq("project_id", project.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const selectedId = isUuid(sp.analysis) ? sp.analysis : history?.find((h) => h.status === "completed")?.id ?? null;
  const { data: sel } = selectedId ? await supabase.from("ai_analyses").select("id, created_at, cutoff_date, model, prompt_version, status, result, metric_snapshot").eq("id", selectedId).eq("project_id", project.id).maybeSingle() : { data: null };
  const res = (sel?.result ?? null) as (StoredAnalysis & { _warnings?: string[] }) | null;

  return (
    <>
      <PageHeader title="AI delay analysis" subtitle="Explains the deterministic numbers. Advisory only: it never changes plans, dates or baselines, and every recommendation needs human approval."
        actions={access.runAiAnalysis ? (
          <form action={runDelayAnalysis} className="flex items-end gap-2"><input type="hidden" name="project_id" value={project.id} /><label className="text-xs text-ink-mute">Analyse as of<input type="date" name="asof" className="input ml-2 w-auto" aria-label="Analysis date (blank = today)" /></label><button className="btn btn-primary" disabled={!configured}>Run analysis</button></form>
        ) : null} />
      <Flash ok={sp.ok} err={sp.err} />
      {!configured && <div className="mb-4"><Alert tone="warn" title="AI analysis is not configured">Set ANTHROPIC_API_KEY and AI_MODEL on the server (see .env.example). All other features work without it.</Alert></div>}
      <div className="mb-4"><Alert tone="info">Causes marked &quot;hypothesis&quot; are not established facts. Only causes tied to a manager-confirmed delay event are shown as confirmed. Costs and dates are never invented: missing data is listed as missing.</Alert></div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="History" padded={false} className="lg:col-span-1">
          {(history ?? []).length === 0 ? <p className="p-4 text-sm text-ink-mute">No analyses yet.</p> : (
            <ul className="divide-y divide-steel-200 text-sm">
              {(history ?? []).map((h) => (
                <li key={h.id} className={h.id === selectedId ? "bg-steel-50" : ""}>
                  <Link href={`/projects/${project.id}/ai?analysis=${h.id}`} className="block px-4 py-2 no-underline">
                    <div className="font-medium">{new Date(h.created_at).toLocaleString("en-GB")}</div>
                    <div className="text-xs text-ink-mute">As of {fmtDate(h.cutoff_date)} · {h.status === "completed" ? "completed" : "failed"}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {!sel ? <Empty title="No analysis selected">Run an analysis to see an explanation of the delay with its evidence.</Empty> : sel.status === "failed" || !res ? (
            <Alert tone="bad" title="This analysis failed">{(history ?? []).find((h) => h.id === sel.id)?.error ?? "No result was stored."}</Alert>
          ) : (
            <>
              <Card title="Summary" actions={<Badge tone={res.overall_assessment === "delayed" ? "bad" : res.overall_assessment === "at_risk" ? "warn" : res.overall_assessment === "on_track" ? "ok" : "neutral"}>{res.overall_assessment.replace("_", " ")}</Badge>}>
                <p className="text-sm">{res.executive_summary}</p>
                <p className="mt-2 text-xs text-ink-mute">Model {sel.model} · prompt {sel.prompt_version} · data as of {fmtDate(sel.cutoff_date)}</p>
                {(res._warnings ?? []).length > 0 && <div className="mt-3"><Alert tone="warn" title="Automatic corrections applied to the model output">{res._warnings!.join(" ")}</Alert></div>}
              </Card>

              {res.delayed_activities.length > 0 && (
                <Card title="Activities behind plan"><ul className="space-y-1 text-sm">{res.delayed_activities.map((d, i) => <li key={i}><Badge tone={d.status === "delayed" ? "bad" : "warn"}>{d.status.replace("_", " ")}</Badge> <strong>{d.activity_code}</strong> {d.summary}</li>)}</ul></Card>
              )}

              <Card title="Likely causes">
                {res.causes.length === 0 ? <p className="text-sm text-ink-mute">No causes could be supported by the data.</p> : (
                  <ul className="space-y-3 text-sm">
                    {[...res.causes].sort((a, b) => (a.status === b.status ? 0 : a.status === "confirmed" ? -1 : 1)).map((c, i) => (
                      <li key={i} className="rounded border border-steel-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={c.status === "confirmed" ? "ok" : "neutral"}>{c.status === "confirmed" ? "Confirmed delay event" : "Hypothesis (not confirmed)"}</Badge>
                          <Badge tone={CONF_TONE[c.confidence]}>Confidence: {c.confidence}</Badge>
                          <span className="text-xs text-ink-mute">{CATEGORY_LABELS[c.category] ?? c.category}{c.activity_code ? ` · ${c.activity_code}` : ""}</span>
                        </div>
                        <p className="mt-1">{c.description}</p>
                        {c.evidence_refs.length > 0 && <p className="mt-1 break-all text-xs text-ink-mute">Evidence: {c.evidence_refs.join(", ")}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Findings"><ul className="list-disc space-y-1 pl-5 text-sm">{res.findings.map((f) => <li key={f.id}>{f.statement}<span className="block break-all text-xs text-ink-mute">{f.evidence_refs.join(", ")}</span></li>)}</ul></Card>

              {res.missing_information.length > 0 && <Card title="Information that would improve this analysis"><ul className="list-disc space-y-1 pl-5 text-sm">{res.missing_information.map((m, i) => <li key={i}><strong>{m.item}</strong>: {m.why_it_matters}</li>)}</ul></Card>}

              <Card title="Recommended actions (advisory)">
                {res.recommended_actions.length === 0 ? <p className="text-sm text-ink-mute">No actions recommended.</p> : (
                  <form action={createRecoveryPlan} className="space-y-3">
                    <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="analysis_id" value={sel.id} />
                    {res.recommended_actions.map((a) => (
                      <div key={a.id} className="rounded border border-steel-200 p-3 text-sm">
                        <label className="flex items-start gap-2">
                          {access.runAiAnalysis && <input type="checkbox" name="action_id" value={a.id} className="mt-1" />}
                          <span><strong>{a.title}</strong> <span className="text-xs text-ink-mute">({a.action_type.replace(/_/g, " ")}{a.target_activity_code ? ` · ${a.target_activity_code}` : ""})</span></span>
                        </label>
                        <p className="mt-1">{a.description}</p>
                        <p className="mt-1 text-xs">Expected benefit: {a.expected_schedule_benefit.working_days === null ? "not quantified" : `${a.expected_schedule_benefit.working_days} working days`} — {a.expected_schedule_benefit.basis}</p>
                        <p className="text-xs">Cost: {a.cost_implications.summary} <span className="text-ink-mute">({a.cost_implications.basis === "none_provided" ? "no cost data was provided" : "from provided data"})</span></p>
                        <div className="mt-2 flex flex-wrap gap-1">{a.feasibility_checks.map((c, i) => <span key={i} title={c.detail}><Badge tone={CHECK_TONE[c.result]}>{c.check}: {c.result}</Badge></span>)}</div>
                        <ul className="mt-1 list-disc pl-5 text-xs text-ink-mute">{a.feasibility_checks.filter((c) => c.result !== "pass").map((c, i) => <li key={i}>{c.detail}</li>)}</ul>
                        {a.risks_tradeoffs.length > 0 && <p className="mt-1 text-xs text-ink-mute">Risks: {a.risks_tradeoffs.join("; ")}</p>}
                        {a.assumptions.length > 0 && <p className="text-xs text-ink-mute">Assumptions: {a.assumptions.join("; ")}</p>}
                      </div>
                    ))}
                    {access.runAiAnalysis && (
                      <div className="flex flex-wrap items-end gap-2 border-t border-steel-200 pt-3">
                        <Field label="Recovery plan title" name="title"><Input name="title" required maxLength={160} /></Field>
                        <button className="btn btn-secondary">Propose recovery plan from selected</button>
                      </div>
                    )}
                  </form>
                )}
              </Card>

              {res.follow_up_questions.length > 0 && <Card title="Questions for the site team"><ul className="list-disc pl-5 text-sm">{res.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></Card>}
              {res.limitations.length > 0 && <Card title="Limitations"><ul className="list-disc pl-5 text-sm text-ink-mute">{res.limitations.map((q, i) => <li key={i}>{q}</li>)}</ul></Card>}
              <details className="card p-4"><summary className="cursor-pointer text-sm font-semibold">Exact metrics the model was given (audit)</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-steel-50 p-2 text-xs">{JSON.stringify(sel.metric_snapshot, null, 1)}</pre></details>
            </>
          )}

          <Card title="Recovery plans" padded={false}>
            {(plans ?? []).length === 0 ? <p className="p-4 text-sm text-ink-mute">No recovery plans yet.</p> : (
              <ul className="divide-y divide-steel-200 text-sm">
                {(plans ?? []).map((p) => (
                  <li key={p.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{p.title}</strong><Badge tone={p.status === "approved" ? "ok" : p.status === "rejected" ? "bad" : "info"}>{p.status}</Badge></div>
                    <ul className="mt-1 list-disc pl-5 text-xs">{((p.actions ?? []) as { id: string; title: string }[]).map((a) => <li key={a.id}>{a.title}</li>)}</ul>
                    {p.decision_notes && <p className="mt-1 text-xs text-ink-mute">Decision notes: {p.decision_notes}</p>}
                    {access.review && p.status === "proposed" && (
                      <div className="mt-2 flex gap-2">
                        <ConfirmForm action={decideRecoveryPlan} fields={{ project_id: project.id, plan_id: p.id, status: "approved" }} label="Approve" title="Approve this recovery plan?" confirmLabel="Approve" message="Records your approval. It does not change the baseline or any date automatically."><Textarea name="notes" rows={2} placeholder="Notes (optional)" /></ConfirmForm>
                        <ConfirmForm action={decideRecoveryPlan} fields={{ project_id: project.id, plan_id: p.id, status: "rejected" }} danger label="Reject" title="Reject this recovery plan?" confirmLabel="Reject" message="Records your decision."><Textarea name="notes" rows={2} placeholder="Reason (optional)" /></ConfirmForm>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
