import Link from "next/link";
import { Alert, Card, Empty, Hint, Input, PageHeader, Select, TableWrap } from "@/components/ui";
import { CategoryBars, DeltaBars, PlannedActualBars, SCurveChart } from "@/components/charts";
import { activityVariance, delayDistribution, machineByPeriod, periodDeltas, periodKey, progressSeries, sampleDates, workforceByPeriod, type Granularity } from "@/lib/analytics/analytics";
import { compareDates, isValidISODate } from "@/lib/calc";
import { CATEGORY_LABELS, fmtDate, fmtPct, fmtPp } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";
import { loadResourceRows } from "@/lib/server/resources-data";

export const dynamic = "force-dynamic";
const GRAN: Granularity[] = ["daily", "weekly", "monthly"];

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, null);
  const g = (GRAN as string[]).includes(sp.g ?? "") ? (sp.g as Granularity) : "weekly";
  const from = sp.from && isValidISODate(sp.from) ? sp.from : project.planned_start;
  const toRaw = sp.to && isValidISODate(sp.to) ? sp.to : b.today;
  const to = compareDates(toRaw, from) < 0 ? from : toRaw;
  // bound the work: at most ~800 sample points
  const dates = sampleDates(from, to, g).slice(-800);
  const cutoff = compareDates(to, b.today) > 0 ? b.today : to;

  const noBaseline = b.baseline.length === 0;
  const series = noBaseline ? [] : progressSeries(b.input, dates, cutoff);
  const deltas = periodDeltas(series);
  const rows = noBaseline ? [] : activityVariance(b.input, b.metrics);

  const [res, { data: delays }] = await Promise.all([
    loadResourceRows(supabase, project.id, to),
    supabase.from("delay_events").select("category, start_date, end_date, duration_working_days, review_status").eq("project_id", project.id).gte("start_date", from).lte("start_date", to).limit(5000),
  ]);
  const dist = delayDistribution((delays ?? []) as never, b.input.calendar);

  const perDay = new Map<string, { p: number; a: number }>();
  for (const w of res.workforce) {
    if (compareDates(w.report_date, from) < 0) continue;
    const c = perDay.get(w.report_date) ?? { p: 0, a: 0 };
    c.p += Number(w.planned_workers); c.a += Number(w.actual_workers); perDay.set(w.report_date, c);
  }
  const wf = workforceByPeriod([...perDay.entries()].map(([date, v]) => ({ date, planned: v.p, actual: v.a })), g);
  const mh = machineByPeriod(res.equipment.filter((e) => compareDates(e.report_date, from) >= 0).map((e) => ({ date: e.report_date, plannedHours: e.planned_hours, operatingHours: e.operating_hours, downtimeHours: e.downtime_hours })), g);

  return (
    <>
      <PageHeader title="Analytics" subtitle="All figures come from the deterministic calculation engine; nothing here is AI-generated." />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="label">From<Input type="date" name="from" defaultValue={from} /></label>
        <label className="label">To<Input type="date" name="to" defaultValue={to} /></label>
        <label className="label">Granularity<Select name="g" defaultValue={g}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></label>
        <button className="btn btn-secondary">Apply</button>
        <Link className="btn btn-ghost" href={`/projects/${project.id}/analytics`}>Reset</Link>
      </form>
      {compareDates(toRaw, b.today) > 0 && <div className="mb-4"><Alert tone="info">Actual values stop today ({fmtDate(b.today)}); later dates show the plan only.</Alert></div>}

      {noBaseline ? <Empty title="No approved baseline">Progress analytics need an approved baseline.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Cumulative progress" className="lg:col-span-2"><SCurveChart data={series.map((s) => ({ date: s.date, plannedPct: s.plannedPct, actualPct: s.actualPct }))} /></Card>
          <Card title={`Progress per ${g === "daily" ? "day" : g === "weekly" ? "week" : "month"} (percentage points of project)`}>
            <DeltaBars data={deltas.map((d) => ({ period: d.date, planned: d.plannedDeltaPp, actual: d.actualDeltaPp }))} />
          </Card>
          <Card title="Delay reasons in range"><CategoryBars data={dist.rows.map((r) => ({ label: CATEGORY_LABELS[r.category] ?? r.category, days: r.workingDays, confirmed: r.confirmedWorkingDays }))} /><p className="mt-2 text-xs text-ink-mute">{dist.note}</p></Card>
          <Card title="Workforce: planned vs actual person-days"><PlannedActualBars unit="pd" data={wf.map((w) => ({ period: w.period, planned: w.plannedPersonDays, actual: w.actualPersonDays }))} />
            <p className="mt-2 text-xs text-ink-mute">Only days with both a planned and an actual headcount are compared. {wf.reduce((n, w) => n + w.unreportedDays, 0)} day(s) lacked data.</p></Card>
          <Card title="Machines: planned vs operating hours"><PlannedActualBars unit="h" data={mh.map((m) => ({ period: m.period, planned: m.plannedHours, actual: m.operatingHours }))} />
            <p className="mt-2 text-xs text-ink-mute">Downtime share over the range: {fmtPct(mh.length ? (mh.reduce((a, m) => a + m.downtimeHours, 0) / Math.max(1, mh.reduce((a, m) => a + m.operatingHours + m.downtimeHours, 0))) * 100 : null)}</p></Card>
          <Card title="Activity variance (as of today)" className="lg:col-span-2" padded={false}>
            <TableWrap><table className="data-table"><thead><tr><th>Activity</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Variance</th><th className="num">Shortfall<Hint text="How far actual quantity is below what should be done by now, as a percent of the planned-to-date quantity. 0 means on or ahead of plan." /></th><th className="num">Schedule var. (days)<Hint text="Earned-schedule variance: working days ahead (+) or behind (-) the plan, from where the baseline says today's progress should have been reached." /></th><th className="num">Forecast delay (days)<Hint text="Projected finish minus planned finish, in calendar days, only when enough recent reports exist for an honest forecast." /></th><th>Flags</th></tr></thead><tbody>
              {[...rows].sort((a, c) => (a.variancePp ?? 0) - (c.variancePp ?? 0)).map((r) => (
                <tr key={r.activityId}><td>{b.codeById.get(r.activityId)} <span className="text-ink-mute">{r.name}</span></td><td className="num">{fmtPct(r.plannedPct)}</td><td className="num">{fmtPct(r.actualPct)}</td><td className="num">{fmtPp(r.variancePp)}</td><td className="num">{fmtPct(r.shortfallPct)}</td><td className="num">{r.scheduleVarianceDays ?? "—"}</td><td className="num">{r.forecastStatus === "insufficient_data" ? <span className="text-ink-mute" title="Not enough reports">n/a</span> : r.estimatedDelayDays ?? 0}</td><td className="text-xs">{r.flags.join("; ") || "—"}</td></tr>
              ))}
            </tbody></table></TableWrap>
          </Card>
        </div>
      )}
      <Card title="How to read these measures" className="mt-4">
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <div><dt className="font-semibold">Progress shortfall</dt><dd className="text-ink-mute">Quantity still missing compared with the plan to date. It says how much work is behind, not when the project will finish.</dd></div>
          <div><dt className="font-semibold">Schedule deviation</dt><dd className="text-ink-mute">How many working days ahead or behind the baseline the current progress is (earned schedule). It measures the past and present.</dd></div>
          <div><dt className="font-semibold">Forecast delay</dt><dd className="text-ink-mute">A projection of the finish date from recent productivity. Shown only with enough data and always with its assumptions; it can change as new reports arrive.</dd></div>
        </dl>
        <p className="mt-3 text-xs text-ink-mute">Workforce or machine shortfalls are resourcing observations. They are shown next to progress so you can compare them, but they are never treated as proof of delay.</p>
      </Card>
      <p className="mt-3 text-xs text-ink-mute">Period buckets: {periodKey(from, g)} … {periodKey(to, g)}. Formulas: see src/lib/calc/FORMULAS.md.</p>
    </>
  );
}
