import { Badge, Card, HealthBadge, PageHeader, TableWrap } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { SCurveChart } from "@/components/charts";
import { activityVariance, delayDistribution, progressSeries, sampleDates, num } from "@/lib/analytics/analytics";
import { CATEGORY_LABELS, fmtDate, fmtDays, fmtPct, fmtPp } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";

export const dynamic = "force-dynamic";

/** Printable progress report (use the browser's Print / Save as PDF). Same engine as the dashboard: no separate numbers. */
export default async function ProgressReport({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, sp.cutoff);
  const m = b.metrics;
  const rows = activityVariance(b.input, m);
  const series = b.baseline.length ? progressSeries(b.input, sampleDates(project.planned_start, project.planned_finish, "weekly"), b.cutoff) : [];
  const [{ data: ms }, { data: delays }] = await Promise.all([
    supabase.from("milestones").select("name, target_date, status, achieved_date").eq("project_id", project.id).order("target_date"),
    supabase.from("delay_events").select("category, start_date, end_date, duration_working_days, review_status").eq("project_id", project.id).lte("start_date", b.cutoff).limit(5000),
  ]);
  const dist = delayDistribution((delays ?? []) as never, b.input.calendar);
  const f = m.forecast;

  return (
    <article className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`Progress report: ${project.code} ${project.name}`} subtitle={`As of ${fmtDate(b.cutoff)} · generated ${fmtDate(b.today)} · baseline revision ${b.revisionNo ?? "—"}`} actions={<PrintButton />} />
      {project.is_demo && <p className="rounded border border-warn/30 bg-warn-soft px-3 py-1 text-center text-xs font-semibold uppercase text-warn">Demo data: fictional project</p>}
      <Card title="Summary">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs uppercase text-ink-mute">Health</dt><dd><HealthBadge status={m.health.status} /></dd></div>
          <div><dt className="text-xs uppercase text-ink-mute">Planned</dt><dd className="text-lg font-semibold">{fmtPct(num(m.plannedPct))}</dd></div>
          <div><dt className="text-xs uppercase text-ink-mute">Actual</dt><dd className="text-lg font-semibold">{fmtPct(num(m.actualPct))}</dd></div>
          <div><dt className="text-xs uppercase text-ink-mute">Variance</dt><dd className="text-lg font-semibold">{fmtPp(m.progressVariancePp ? num(m.progressVariancePp) : null)}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase text-ink-mute">Planned finish</dt><dd>{fmtDate(f.plannedFinish)}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase text-ink-mute">Forecast finish</dt><dd>{f.status === "uncertain" ? `Not enough data${f.latestKnownFinish ? ` (latest known ${fmtDate(f.latestKnownFinish)})` : ""}` : `${fmtDate(f.forecastFinish)} (${f.estimatedDelayDays ? fmtDays(f.estimatedDelayDays) + " late" : "no delay forecast"})`}</dd></div>
        </dl>
        {m.health.reasons.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{m.health.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      </Card>
      {series.length > 0 && <Card title="Progress curve"><SCurveChart data={series.map((s) => ({ date: s.date, plannedPct: s.plannedPct, actualPct: s.actualPct }))} /></Card>}
      <Card title="Activities" padded={false}><TableWrap><table className="data-table"><thead><tr><th>Activity</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Variance</th><th>Forecast finish</th><th>Critical</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.activityId}><td>{b.codeById.get(r.activityId)} {r.name}</td><td className="num">{fmtPct(r.plannedPct)}</td><td className="num">{fmtPct(r.actualPct)}</td><td className="num">{fmtPp(r.variancePp)}</td><td>{r.forecastStatus === "insufficient_data" ? "Insufficient data" : fmtDate(r.forecastFinish)}</td><td>{r.critical ? "Yes" : "—"}</td></tr>)}
      </tbody></table></TableWrap></Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Milestones"><ul className="space-y-1 text-sm">{(ms ?? []).map((x, i) => <li key={i}>{x.name} · target {fmtDate(x.target_date)} · <Badge tone={x.status === "achieved" ? "ok" : "neutral"}>{x.status === "achieved" ? `achieved ${fmtDate(x.achieved_date)}` : x.status}</Badge></li>)}{(ms ?? []).length === 0 && <li className="text-ink-mute">None defined.</li>}</ul></Card>
        <Card title="Delay reasons (working days)"><ul className="space-y-1 text-sm">{dist.rows.map((r) => <li key={r.category}>{CATEGORY_LABELS[r.category] ?? r.category}: {r.workingDays} ({r.confirmedWorkingDays} confirmed)</li>)}{dist.rows.length === 0 && <li className="text-ink-mute">No delay events.</li>}</ul><p className="mt-2 text-xs text-ink-mute">{dist.note}</p></Card>
      </div>
      <p className="text-xs text-ink-mute">All figures are produced by the deterministic calculation engine from submitted and approved site reports. Missing reporting days are not counted as zero progress. Formulas: src/lib/calc/FORMULAS.md.</p>
    </article>
  );
}
