import Link from "next/link";
import { Card, Empty, Flash, HealthBadge, Hint, PageHeader, ProgressBar, ReportStatusBadge, Stat, TableWrap, Alert } from "@/components/ui";
import { GroupedBars } from "@/components/charts";
import { summarizeProjects, summarizeResources } from "@/lib/server/dashboard";
import { delayTrendByMonth } from "@/lib/analytics/analytics";
import { getMemberships, requireUser, isUuid, type ProjectRow } from "@/lib/server/session";
import { fmtDate, fmtDays, fmtPct, fmtPp, REPORT_STATUS_LABELS } from "@/lib/format";
import { todayIn } from "@/lib/forms";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const HEALTH = ["on_track", "at_risk", "delayed", "unknown"] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships(supabase, user.id);

  const { data: all } = await supabase.from("projects").select("*").order("code").limit(500);
  let projects = (all ?? []) as unknown as ProjectRow[];
  const orgFilter = isUuid(sp.org) ? sp.org : null;
  const projectFilter = isUuid(sp.project) ? sp.project : null;
  const statusFilter = HEALTH.find((h) => h === sp.status) ?? null;
  const asOf = sp.asof && /^\d{4}-\d{2}-\d{2}$/.test(sp.asof) ? sp.asof : null;
  if (orgFilter) projects = projects.filter((p) => p.organization_id === orgFilter);
  const projectOptions = projects;
  if (projectFilter) projects = projects.filter((p) => p.id === projectFilter);

  const { rows: allRows, truncated } = await summarizeProjects(supabase, projects, asOf);
  const rows = statusFilter ? allRows.filter((r) => r.health === statusFilter) : allRows;

  const ids = projects.map((p) => p.id);
  const today = todayIn(projects[0]?.timezone ?? "UTC");
  const nameOf = new Map(projects.map((p) => [p.id, `${p.code} · ${p.name}`]));
  const [milestonesRes, reportsRes, unreviewedRes, awaitingRes] = ids.length
    ? await Promise.all([
        supabase.from("milestones").select("id, project_id, name, target_date, status").in("project_id", ids).eq("status", "pending").order("target_date").limit(8),
        supabase.from("daily_reports").select("id, project_id, report_date, shift, status, profiles:reporter_id(full_name)").in("project_id", ids).order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(8),
        supabase.from("delay_events").select("id, project_id, category, start_date, description").in("project_id", ids).eq("review_status", "unreviewed").order("start_date", { ascending: false }).limit(8),
        supabase.from("daily_reports").select("id", { count: "exact", head: true }).in("project_id", ids).eq("status", "submitted"),
      ])
    : [null, null, null, null];

  const milestones = (milestonesRes?.data ?? []) as { id: string; project_id: string; name: string; target_date: string }[];
  const reports = (reportsRes?.data ?? []) as unknown as { id: string; project_id: string; report_date: string; shift: string; status: string; profiles: { full_name: string | null } | null }[];
  const unreviewed = (unreviewedRes?.data ?? []) as { id: string; project_id: string; category: string; start_date: string; description: string }[];
  const awaiting = awaitingRes?.count ?? 0;

  const [{ data: trendRaw }, resources] = await Promise.all([
    ids.length ? supabase.from("delay_events").select("project_id, start_date, end_date, duration_working_days, review_status").in("project_id", ids).order("start_date", { ascending: false }).limit(3000) : Promise.resolve({ data: [] }),
    summarizeResources(supabase, allRows, 10),
  ]);
  const calById = new Map(allRows.map((r) => [r.project.id, r.bundle.input.calendar]));
  const trend = delayTrendByMonth((trendRaw ?? []) as never, (id) => calById.get(id) ?? { workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] }).slice(-12);

  const counts = Object.fromEntries(HEALTH.map((h) => [h, allRows.filter((r) => r.health === h).length])) as Record<(typeof HEALTH)[number], number>;
  const withData = allRows.filter((r) => r.plannedPct !== null && r.actualPct !== null);
  const avg = (f: (r: (typeof allRows)[number]) => number) => (withData.length ? withData.reduce((s, r) => s + f(r), 0) / withData.length : null);
  const planned = avg((r) => r.plannedPct ?? 0);
  const actual = avg((r) => r.actualPct ?? 0);
  const critical = allRows.flatMap((r) => r.behindCritical.map((c) => ({ ...c, project: r.project })));
  const gaps = allRows.flatMap((r) => r.dataGaps.map((g) => ({ ...g, project: r.project })));

  return (
    <>
      <PageHeader title="Portfolio dashboard" subtitle={`Progress as of ${fmtDate(asOf ?? today)}. Every figure is calculated from the project's approved baseline and submitted/approved daily reports.`} />
      <Flash ok={sp.ok} err={sp.err} />

      <form method="get" className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Dashboard filters">
        {memberships.length > 1 && (
          <div>
            <label className="label" htmlFor="org">Organization</label>
            <select id="org" name="org" className="input" defaultValue={orgFilter ?? ""}>
              <option value="">All</option>
              {memberships.map((m) => <option key={m.organization_id} value={m.organization_id}>{m.organization.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="project">Project</label>
          <select id="project" name="project" className="input" defaultValue={projectFilter ?? ""}>
            <option value="">All projects</option>
            {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Health</label>
          <select id="status" name="status" className="input" defaultValue={statusFilter ?? ""}>
            <option value="">Any</option>
            <option value="on_track">On track</option><option value="at_risk">At risk</option>
            <option value="delayed">Delayed</option><option value="unknown">Not enough data</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="asof">As of date</label>
          <input id="asof" name="asof" type="date" className="input" defaultValue={asOf ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary" type="submit">Apply</button>
          <Link className="btn btn-secondary" href="/dashboard">Reset</Link>
        </div>
      </form>

      {truncated && <div className="mb-4"><Alert tone="warn">Only the first 30 projects are summarised. Use the project filter to see others.</Alert></div>}

      {allRows.length === 0 ? (
        <Empty title="No projects yet" action={<Link className="btn btn-primary" href="/projects/new">Create a project</Link>}>
          Create a project, add an approved baseline schedule and start submitting daily reports to see live progress here.
        </Empty>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Projects" value={allRows.length} />
            <Stat label="On track" value={counts.on_track} tone="ok" />
            <Stat label="At risk" value={counts.at_risk} tone="warn" />
            <Stat label="Delayed" value={counts.delayed} tone="bad" />
            <Stat label="Planned (avg)" value={fmtPct(planned)} hint="Equal-weight average of projects with data" />
            <Stat label="Actual (avg)" value={fmtPct(actual)} hint={withData.length < allRows.length ? `${allRows.length - withData.length} project(s) have no approved baseline` : undefined} />
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-2">
            <Card title={<>Planned vs actual progress by project<Hint text="Percent complete as of the selected date, from the approved baseline and submitted/approved reports. Projects without an approved baseline are omitted." /></>}>
              <GroupedBars label="Planned versus actual progress per project" unit="%" xKey="project"
                data={withData.map((r) => ({ project: r.project.code, planned: r.plannedPct, actual: r.actualPct }))}
                series={[{ key: "planned", name: "Planned", color: "planned" }, { key: "actual", name: "Actual", color: "actual" }]} />
            </Card>
            <Card title={<>Delay trend: working days lost per month<Hint text="Sum of reported delay events by the month they started. Dismissed events are excluded; unreviewed events are included but shown separately from confirmed ones. Overlapping events are summed." /></>}>
              <GroupedBars label="Working days lost to delay events per month" unit="wd" xKey="month"
                data={trend.map((t) => ({ month: t.month, all: t.workingDays, confirmed: t.confirmedWorkingDays }))}
                series={[{ key: "all", name: "All non-dismissed", color: "warn" }, { key: "confirmed", name: "Confirmed", color: "bad" }]} />
            </Card>
          </div>

          <Card title="Projects" padded={false} className="mb-5">
            {rows.length === 0 ? (
              <div className="p-4"><Empty title="No project matches the health filter" /></div>
            ) : (
              <TableWrap>
                <table className="data-table">
                  <thead><tr><th>Project</th><th>Health</th><th>Planned vs actual</th><th className="num">Variance</th><th>Forecast finish</th><th className="num">Est. delay</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.project.id}>
                        <td><Link href={`/projects/${r.project.id}`} className="font-medium">{r.project.code} · {r.project.name}</Link><div className="text-xs text-ink-mute">Planned finish {fmtDate(r.project.planned_finish)}</div></td>
                        <td><HealthBadge status={r.health} /></td>
                        <td><ProgressBar planned={r.plannedPct} actual={r.actualPct} /><div className="mt-1 text-xs text-ink-mute">{fmtPct(r.actualPct)} actual · {fmtPct(r.plannedPct)} planned</div></td>
                        <td className="num">{fmtPp(r.variancePp)}</td>
                        <td>{r.forecastStatus === "uncertain" ? <span title="Not enough reported data for every activity">Uncertain{r.bundle.metrics.forecast.latestKnownFinish ? ` (≥ ${fmtDate(r.bundle.metrics.forecast.latestKnownFinish)})` : ""}</span> : fmtDate(r.forecastFinish)}</td>
                        <td className="num">{r.delayDays === null ? "—" : fmtDays(r.delayDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Upcoming milestones" padded={false}>
              {milestones.length === 0 ? <div className="p-4 text-sm text-ink-mute">No pending milestones.</div> : (
                <ul className="divide-y divide-steel-100">
                  {milestones.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span><Link href={`/projects/${m.project_id}/plan`}>{m.name}</Link><span className="block text-xs text-ink-mute">{nameOf.get(m.project_id)}</span></span>
                      <span className={m.target_date < today ? "font-medium text-bad" : ""}>{fmtDate(m.target_date)}{m.target_date < today ? " (overdue)" : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Recent daily site reports" padded={false}>
              {reports.length === 0 ? <div className="p-4 text-sm text-ink-mute">No reports yet.</div> : (
                <ul className="divide-y divide-steel-100">
                  {reports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span><Link href={`/projects/${r.project_id}/reports/${r.id}`}>{fmtDate(r.report_date)} · {r.shift}</Link><span className="block text-xs text-ink-mute">{nameOf.get(r.project_id)} · {r.profiles?.full_name ?? "—"}</span></span>
                      <ReportStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
              {awaiting > 0 && <div className="border-t border-steel-100 px-4 py-2 text-xs text-ink-mute">{awaiting} report(s) awaiting review.</div>}
            </Card>

            <Card title="Critical activities behind plan" padded={false}>
              {critical.length === 0 ? <div className="p-4 text-sm text-ink-mute">No critical activity is behind plan.</div> : (
                <ul className="divide-y divide-steel-100">
                  {critical.slice(0, 8).map((c) => (
                    <li key={`${c.project.id}-${c.code}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span><Link href={`/projects/${c.project.id}/plan`}>{c.name}</Link><span className="block text-xs text-ink-mute">{c.project.code}</span></span>
                      <span className="font-medium text-bad">{fmtPp(c.variancePp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Unresolved issues" padded={false}>
              <ul className="divide-y divide-steel-100 text-sm">
                {unreviewed.map((e) => (
                  <li key={e.id} className="px-4 py-2"><Link href={`/projects/${e.project_id}/delays`}>Unreviewed delay: {e.description.slice(0, 70)}</Link><span className="block text-xs text-ink-mute">{nameOf.get(e.project_id)} · {fmtDate(e.start_date)}</span></li>
                ))}
                {gaps.slice(0, 5).map((g) => (
                  <li key={`${g.project.id}-${g.code}-${g.flag}`} className="px-4 py-2"><Link href={`/projects/${g.project.id}/reports`}>{g.code}: {g.flag === "NO_REPORTS" ? "due to have started, no reports" : "no recent reports"}</Link><span className="block text-xs text-ink-mute">{g.project.code}</span></li>
                ))}
                {unreviewed.length === 0 && gaps.length === 0 && awaiting === 0 && <li className="px-4 py-3 text-ink-mute">Nothing unresolved.</li>}
                {awaiting > 0 && <li className="px-4 py-2 text-ink-mute">{awaiting} {REPORT_STATUS_LABELS.submitted.toLowerCase()} report(s) await manager review.</li>}
              </ul>
            </Card>
          </div>

          <Card title={<>Resource utilization{resources.length < allRows.length ? ` (first ${resources.length} projects)` : ""}<Hint text="Workforce compares reported headcount with planned headcount on days that have both. Machine utilization is operating hours divided by planned hours. These describe resourcing; they are not, on their own, proof that a project is delayed." /></>} padded={false} className="mt-5">
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Project</th><th className="num">Workforce vs plan</th><th className="num">Days compared</th><th className="num">Machine utilization</th><th className="num">Downtime share</th></tr></thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.project.id}>
                      <td><Link href={`/projects/${r.project.id}/analytics`}>{r.project.code} · {r.project.name}</Link></td>
                      <td className="num">{r.workforceVariancePct === null ? "—" : fmtPp(r.workforceVariancePct).replace(" pp", "%")}</td>
                      <td className="num">{r.comparedDays}{r.unreportedDays ? <span className="text-xs text-ink-mute"> (+{r.unreportedDays} without data)</span> : null}</td>
                      <td className="num">{fmtPct(r.utilizationPct)}</td>
                      <td className="num">{fmtPct(r.downtimePct)}</td>
                    </tr>
                  ))}
                  {resources.length === 0 && <tr><td colSpan={5} className="text-ink-mute">No workforce or equipment data yet.</td></tr>}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </>
      )}
    </>
  );
}
