import Link from "next/link";
import { Alert, Badge, Card, Empty, Flash, HealthBadge, PageHeader, ProgressBar, ReportStatusBadge, Stat, TableWrap } from "@/components/ui";
import { SCurveChart } from "@/components/charts";
import { addDays, compareDates, countWorkingDays, isWorkingDay, type ISODate } from "@/lib/calc";
import { activityVariance, progressSeries, sampleDates, num } from "@/lib/analytics/analytics";
import { CATEGORY_LABELS, fmtDate, fmtDays, fmtPct, fmtPp } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";
import { loadResourceRows } from "@/lib/server/resources-data";
import { buildResources } from "@/lib/ai/resources";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function Overview({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, sp.cutoff);
  const m = b.metrics;

  const [{ data: milestones }, { data: recent }, { data: openDelays }, { data: draft }] = await Promise.all([
    supabase.from("milestones").select("id, name, target_date, status, achieved_date").eq("project_id", project.id).order("target_date"),
    supabase.from("daily_reports").select("id, report_date, shift, status, reporter_id").eq("project_id", project.id).order("report_date", { ascending: false }).limit(6),
    supabase.from("delay_events").select("id, category, start_date, description, review_status").eq("project_id", project.id).eq("review_status", "unreviewed").order("start_date", { ascending: false }).limit(5),
    supabase.from("baseline_revisions").select("id").eq("project_id", project.id).eq("status", "draft").maybeSingle(),
  ]);

  const resData = await loadResourceRows(supabase, project.id, b.cutoff);
  const res = buildResources(resData.workforce, resData.equipment, b.cutoff);
  const noBaseline = b.baseline.length === 0;
  const rows = activityVariance(b.input, m);
  const end = compareDates(b.cutoff, project.planned_finish) > 0 ? project.planned_finish : b.cutoff;
  const planEnd = project.planned_finish;
  const dates = noBaseline ? [] : sampleDates(project.planned_start, planEnd, "weekly");
  const series = noBaseline ? [] : progressSeries(b.input, dates, b.cutoff);

  // Data gaps: working days up to the cutoff with no submitted/approved report
  const reported = new Set(b.input.entries.map((e) => e.date));
  const gaps: ISODate[] = [];
  if (!noBaseline) {
    for (let d = project.planned_start; compareDates(d, end) <= 0 && gaps.length < 400; d = addDays(d, 1)) {
      if (isWorkingDay(b.input.calendar, d) && !reported.has(d)) gaps.push(d);
    }
  }
  const workedSoFar = noBaseline ? 0 : countWorkingDays(b.input.calendar, project.planned_start, end);
  const recentGaps = gaps.slice(-5);

  const f = m.forecast;
  const delayTone = f.status === "uncertain" ? undefined : (f.estimatedDelayDays ?? 0) > 0 ? "bad" : "ok";
  const variance = m.progressVariancePp ? num(m.progressVariancePp) : null;

  return (
    <>
      <PageHeader
        title={`${project.name}`}
        subtitle={`${project.location ?? "Location not set"} · ${fmtDate(project.planned_start)} to ${fmtDate(project.planned_finish)}`}
        actions={
          <>
          <Link href={`/projects/${project.id}/reports/new`} className="btn btn-primary"><Icon name="plus" size={16} /> New report</Link>
          <Link href={`/projects/${project.id}/plan`} className="btn btn-secondary"><Icon name="plan" size={16} /> Planning</Link>
          <Link href={`/projects/${project.id}/progress-report`} className="btn btn-secondary"><Icon name="report" size={16} /> Progress report</Link>
          <form method="get" className="flex items-end gap-2">
            <label className="text-xs text-ink-mute">As of
              <input type="date" name="cutoff" defaultValue={sp.cutoff ?? ""} max={b.today} className="input ml-2 w-auto" />
            </label>
            <button className="btn btn-secondary" type="submit">Apply</button>
            {sp.cutoff && <Link href={`/projects/${project.id}`} className="btn btn-ghost">Today</Link>}
          </form>
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      {sp.cutoff && <Alert tone="info" title="Historical view">All figures are computed as of {fmtDate(b.cutoff)}, using only reports submitted for dates up to then.</Alert>}

      {noBaseline ? (
        <Empty title="No approved baseline yet" action={<Link className="btn btn-primary" href={`/projects/${project.id}/plan`}>Open planning</Link>}>
          Progress, forecasts and the critical path need an approved baseline. {draft ? "A draft revision exists: finish and approve it." : "Add activities, or import them from CSV/Excel."}
        </Empty>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Health" value={<HealthBadge status={m.health.status} />} hint={m.health.reasons[0]} />
            <Stat label="Planned progress" value={fmtPct(num(m.plannedPct))} hint={`as of ${fmtDate(b.cutoff)}`} />
            <Stat label="Actual progress" value={fmtPct(num(m.actualPct))} hint="submitted + approved reports" />
            <Stat label="Variance" value={fmtPp(variance)} tone={variance === null ? undefined : variance <= -10 ? "bad" : variance <= -5 ? "warn" : "ok"} />
            <Stat
              label="Forecast finish"
              value={f.status === "uncertain" ? "Not enough data" : fmtDate(f.forecastFinish)}
              tone={delayTone}
              hint={f.status === "uncertain" ? `${f.uncertainActivityIds.length} activit${f.uncertainActivityIds.length === 1 ? "y has" : "ies have"} no reliable forecast${f.latestKnownFinish ? `; latest known ${fmtDate(f.latestKnownFinish)}` : ""}` : `Planned ${fmtDate(f.plannedFinish)} · ${f.estimatedDelayDays ? fmtDays(f.estimatedDelayDays) + " late" : "no delay forecast"}`}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Planned vs actual progress (S-curve)" className="lg:col-span-2">
              <SCurveChart data={series.map((s) => ({ date: s.date, plannedPct: s.plannedPct, actualPct: s.actualPct }))} />
              <p className="mt-2 text-xs text-ink-mute">Weekly samples. Planned and actual use the same cutoff and calculation; the actual line stops at the cutoff.</p>
            </Card>
            <Card title="Data quality">
              <ul className="space-y-2 text-sm">
                <li>Working days so far: <strong>{workedSoFar}</strong></li>
                <li>Working days with no submitted report: <strong className={gaps.length ? "text-warn" : ""}>{gaps.length}</strong></li>
                {recentGaps.length > 0 && <li className="text-xs text-ink-mute">Latest gaps: {recentGaps.map(fmtDate).join(", ")}</li>}
                <li>Activities without a forecast: <strong>{f.uncertainActivityIds.length}</strong></li>
              </ul>
              <p className="mt-2 text-xs text-ink-mute">Missing days are never counted as zero progress; they simply reduce how much the forecast can be trusted.</p>
              {draft && <div className="mt-3"><Badge tone="info">Draft baseline revision in progress</Badge></div>}
            </Card>
          </div>

          <Card title="Activities" className="mt-4" padded={false}>
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Activity</th><th>Progress</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Shortfall</th><th>Forecast finish</th><th>Float</th><th>Flags</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.activityId}>
                      <td><span className="font-medium">{b.codeById.get(r.activityId)}</span> <span className="text-ink-mute">{r.name}</span></td>
                      <td><ProgressBar planned={r.plannedPct} actual={r.actualPct} /></td>
                      <td className="num">{fmtPct(r.plannedPct)}</td>
                      <td className="num">{fmtPct(r.actualPct)}</td>
                      <td className="num">{fmtPct(r.shortfallPct)}</td>
                      <td>{r.forecastStatus === "insufficient_data" ? <span className="text-ink-mute">Insufficient data</span> : fmtDate(r.forecastFinish)}{r.estimatedDelayDays ? <span className="ml-1 text-bad">(+{r.estimatedDelayDays}d)</span> : null}</td>
                      <td>{r.critical ? <Badge tone="bad">Critical</Badge> : r.totalFloatWorkingDays === null ? "—" : `${r.totalFloatWorkingDays} wd`}</td>
                      <td className="text-xs text-ink-mute">{r.flags.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Milestones" actions={<Link href={`/projects/${project.id}/plan`} className="text-sm">Manage</Link>}>
          {(milestones ?? []).length === 0 ? <p className="text-sm text-ink-mute">No milestones defined.</p> : (
            <ul className="space-y-2 text-sm">
              {(milestones ?? []).map((x) => {
                const late = x.status !== "achieved" && compareDates(x.target_date, b.today) < 0;
                return (
                  <li key={x.id} className="flex items-center justify-between gap-2">
                    <span>{x.name}<span className="block text-xs text-ink-mute">Target {fmtDate(x.target_date)}</span></span>
                    <Badge tone={x.status === "achieved" ? "ok" : late ? "bad" : "neutral"}>{x.status === "achieved" ? `Achieved ${fmtDate(x.achieved_date)}` : late ? "Overdue" : x.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Recent reports" actions={<Link href={`/projects/${project.id}/reports`} className="text-sm">All reports</Link>}>
          {(recent ?? []).length === 0 ? <p className="text-sm text-ink-mute">No reports yet.</p> : (
            <ul className="space-y-2 text-sm">
              {(recent ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <Link href={`/projects/${project.id}/reports/${r.id}`}>{fmtDate(r.report_date)} · {r.shift}</Link>
                  <ReportStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Delay events awaiting review" actions={<Link href={`/projects/${project.id}/delays`} className="text-sm">All delays</Link>}>
          {(openDelays ?? []).length === 0 ? <p className="text-sm text-ink-mute">Nothing waiting for review.</p> : (
            <ul className="space-y-2 text-sm">
              {(openDelays ?? []).map((d) => (
                <li key={d.id}><strong>{CATEGORY_LABELS[d.category] ?? d.category}</strong> <span className="text-xs text-ink-mute">from {fmtDate(d.start_date)}</span><div className="truncate text-xs text-ink-mute">{d.description}</div></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!noBaseline && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Resource overview">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs uppercase text-ink-mute">Workforce vs plan</dt><dd className="text-lg font-semibold">{res.workforce.variancePct === null ? "—" : `${Number(res.workforce.variancePct) > 0 ? "+" : ""}${res.workforce.variancePct}%`}</dd><dd className="text-xs text-ink-mute">{res.workforce.actualPersonDays} of {res.workforce.plannedPersonDays} planned person-days · {res.workforce.comparedDays} days compared</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">Machine utilization</dt><dd className="text-lg font-semibold">{fmtPct(res.machines.utilizationPct)}</dd><dd className="text-xs text-ink-mute">{res.machines.operatingHours} of {res.machines.plannedHours} planned hours · downtime {fmtPct(res.machines.downtimePct)}</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">Peak workers on one day</dt><dd className="text-lg font-semibold">{res.observedPeakWorkersOnAnyDay ?? "—"}</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">Days without workforce data</dt><dd className="text-lg font-semibold">{res.workforce.unreportedDays}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-ink-mute">A workforce or machine shortfall describes resourcing. It is not, by itself, evidence that the project is delayed; compare it with progress variance on the Analytics page.</p>
          </Card>
          <Card title="Forecast and its assumptions">
            <p className="text-sm">{f.status === "uncertain" ? "A finish date cannot be given for every activity yet." : f.status === "completed" ? "All activities are complete." : `Latest activity forecast finish: ${fmtDate(f.forecastFinish)}.`}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-mute">
              {f.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              {f.uncertainActivityIds.length > 0 && <li>{f.uncertainActivityIds.length} activit{f.uncertainActivityIds.length === 1 ? "y has" : "ies have"} too little reporting for a date: {f.uncertainActivityIds.slice(0, 6).map((id) => b.codeById.get(id)).join(", ")}{f.uncertainActivityIds.length > 6 ? "…" : ""}.</li>}
            </ul>
            <p className="mt-3 text-xs"><Link href={`/projects/${project.id}/analytics`}>Open analytics</Link> · <Link href={`/projects/${project.id}/ai`}>AI delay analysis</Link></p>
          </Card>
        </div>
      )}
    </>
  );
}
