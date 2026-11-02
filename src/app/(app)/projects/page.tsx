import Link from "next/link";
import { Alert, Badge, Card, Empty, Flash, HealthBadge, LinkButton, PageHeader, ProgressBar, TableWrap } from "@/components/ui";
import { fmtDate, fmtDays, fmtPct, fmtPp } from "@/lib/format";
import { summarizeProjects, type ProjectSummary } from "@/lib/server/dashboard";
import { getMemberships, requireUser, type ProjectRow } from "@/lib/server/session";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const HEALTH = ["on_track", "at_risk", "delayed", "unknown"];
const SORTS: Record<string, string> = { code: "Code", finish: "Planned finish", variance: "Progress variance (worst first)" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; status?: string; q?: string; health?: string; sort?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships(supabase, user.id);
  let query = supabase.from("projects").select("*").order("code").limit(500);
  if (sp.status && STATUS_LABEL[sp.status]) query = query.eq("status", sp.status);
  const { data } = await query;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = ((data ?? []) as unknown as ProjectRow[]).filter((p) => !q || `${p.code} ${p.name} ${p.location ?? ""}`.toLowerCase().includes(q));
  const canCreate = memberships.some((m) => m.role !== "site_engineer");

  // Live metrics for the first 30 matches (same engine as the dashboard); the rest are listed without metrics.
  const { rows: summaries, truncated } = await summarizeProjects(supabase, filtered, null);
  const sumById = new Map<string, ProjectSummary>(summaries.map((s) => [s.project.id, s]));
  const { data: people } = await supabase.from("v_org_members").select("user_id, full_name, email").in("organization_id", memberships.map((m) => m.organization_id));
  const nameOf = new Map((people ?? []).map((p) => [p.user_id as string, (p.full_name as string | null) || (p.email as string | null) || "—"]));

  let list = filtered.map((p) => ({ p, s: sumById.get(p.id) ?? null }));
  if (sp.health && HEALTH.includes(sp.health)) list = list.filter((x) => x.s?.health === sp.health);
  const sort = SORTS[sp.sort ?? ""] ? sp.sort! : "code";
  if (sort === "finish") list.sort((a, b) => a.p.planned_finish.localeCompare(b.p.planned_finish));
  if (sort === "variance") list.sort((a, b) => (a.s?.variancePp ?? 999) - (b.s?.variancePp ?? 999));

  return (
    <>
      <PageHeader title="Projects" subtitle={`${list.length} project${list.length === 1 ? "" : "s"}`} actions={canCreate ? <LinkButton href="/projects/new" variant="primary">New project</LinkButton> : null} />
      <Flash ok={sp.ok} err={sp.err} />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3" aria-label="Project filters">
        <div className="min-w-[12rem] flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" type="search" className="input" defaultValue={sp.q ?? ""} placeholder="Code, name or location" /></div>
        <div><label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={sp.status ?? ""}><option value="">Any</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="health">Health</label>
          <select id="health" name="health" className="input" defaultValue={sp.health ?? ""}><option value="">Any</option><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="delayed">Delayed</option><option value="unknown">Not enough data</option></select></div>
        <div><label className="label" htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" className="input" defaultValue={sort}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <button className="btn btn-primary" type="submit">Apply</button>
        <Link className="btn btn-ghost" href="/projects">Reset</Link>
      </form>
      {truncated && <div className="mb-4"><Alert tone="warn">Live progress is shown for the first 30 matching projects. Narrow the search to see metrics for the others.</Alert></div>}
      {list.length === 0 ? (
        <Empty title="No projects found" action={canCreate ? <LinkButton href="/projects/new" variant="primary">Create a project</LinkButton> : undefined}>
          {canCreate ? "Change the filters or create your first project." : "You have not been assigned to any project yet. Ask a project manager to add you."}
        </Empty>
      ) : (
        <Card padded={false}>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Project</th><th>Location</th><th>Manager</th><th>Dates</th><th>Planned vs actual</th><th className="num">Variance</th><th>Forecast finish</th><th>Health</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map(({ p, s }) => (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`} className="font-medium">{p.name}</Link><div className="font-mono text-xs text-ink-mute">{p.code}{p.is_demo && <> <Badge tone="warn">Demo</Badge></>}</div></td>
                    <td>{p.location ?? "—"}</td>
                    <td>{p.manager_id ? nameOf.get(p.manager_id) ?? "—" : "—"}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(p.planned_start)}<br />→ {fmtDate(p.planned_finish)}</td>
                    <td>{s && s.plannedPct !== null ? <><ProgressBar planned={s.plannedPct} actual={s.actualPct} /><div className="mt-1 text-xs text-ink-mute">{fmtPct(s.actualPct)} / {fmtPct(s.plannedPct)}</div></> : <span className="text-xs text-ink-mute">{s ? "No approved baseline" : "Not calculated"}</span>}</td>
                    <td className="num">{fmtPp(s?.variancePp)}</td>
                    <td className="text-sm">{!s ? "—" : s.forecastStatus === "uncertain" ? <span title="Not enough reported data for every activity">Uncertain</span> : <>{fmtDate(s.forecastFinish)}{s.delayDays ? <div className="text-xs text-bad">{fmtDays(s.delayDays)} late</div> : null}</>}</td>
                    <td>{s ? <HealthBadge status={s.health} /> : "—"}</td>
                    <td><Badge tone={p.status === "active" ? "ok" : "neutral"}>{STATUS_LABEL[p.status] ?? p.status}</Badge></td>
                    <td className="whitespace-nowrap"><Link href={`/projects/${p.id}/settings`} className="text-sm">Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
