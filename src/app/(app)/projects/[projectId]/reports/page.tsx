import Link from "next/link";
import { Card, Empty, Flash, Input, PageHeader, ReportStatusBadge, Select, TableWrap } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { parseReportFilter } from "@/lib/export/reports";
import { getProjectContext } from "@/lib/server/session";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project } = await getProjectContext(projectId);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && ["from", "to", "status", "activity"].includes(k)) as [string, string][]);
  const f = parseReportFilter(qs);
  const page = Math.max(1, Number(sp.page) || 1);

  let q = supabase.from("daily_reports").select("id, report_date, shift, status, weather, reporter:profiles!daily_reports_reporter_id_fkey(full_name, email), daily_report_lines(count)", { count: "exact" }).eq("project_id", project.id);
  if (f.from) q = q.gte("report_date", f.from);
  if (f.to) q = q.lte("report_date", f.to);
  if (f.status) q = q.eq("status", f.status);
  const { data: actOpts } = await supabase.from("activities").select("id, code, name").eq("project_id", project.id).order("code").limit(500);
  if (f.activityId) {
    // reports that contain a line for the chosen activity
    const { data: hit } = await supabase.from("daily_report_lines").select("report_id").eq("project_id", project.id).eq("activity_id", f.activityId).limit(3000);
    q = q.in("id", [...new Set((hit ?? []).map((h) => h.report_id as string))]);
  }
  const { data, count, error } = await q.order("report_date", { ascending: false }).order("shift").range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as unknown as { id: string; report_date: string; shift: string; status: string; weather: string | null; reporter: { full_name: string | null; email: string | null } | null; daily_report_lines: { count: number }[] }[];
  const exportQs = qs.toString();
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `/projects/${project.id}/reports?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Daily site reports" subtitle="Submitted and approved reports count toward progress. Drafts and returned reports do not."
        actions={<>
          <Link className="btn btn-secondary" href={`/projects/${project.id}/api/export?kind=reports&format=csv${exportQs ? `&${exportQs}` : ""}`} prefetch={false}>Export CSV</Link>
          <Link className="btn btn-secondary" href={`/projects/${project.id}/api/export?kind=reports&format=xlsx${exportQs ? `&${exportQs}` : ""}`} prefetch={false}>Export Excel</Link>
          <Link className="btn btn-primary" href={`/projects/${project.id}/reports/new`}>New report</Link>
        </>} />
      <Flash ok={sp.ok} err={sp.err ?? (error ? "Reports could not be loaded." : undefined)} />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="label">From<Input type="date" name="from" defaultValue={f.from ?? ""} /></label>
        <label className="label">To<Input type="date" name="to" defaultValue={f.to ?? ""} /></label>
        <label className="label">Status<Select name="status" defaultValue={f.status ?? ""}><option value="">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Returned</option></Select></label>
        <label className="label">Activity<Select name="activity" defaultValue={f.activityId ?? ""}><option value="">All</option>{(actOpts ?? []).map((a) => <option key={a.id as string} value={a.id as string}>{a.code as string} {a.name as string}</option>)}</Select></label>
        <button className="btn btn-secondary" type="submit">Filter</button>
        <Link href={`/projects/${project.id}/reports`} className="btn btn-ghost">Clear</Link>
      </form>
      {rows.length === 0 ? <Empty title="No reports match" action={<Link className="btn btn-primary" href={`/projects/${project.id}/reports/new`}>Create the first report</Link>}>Change the filters or create a report.</Empty> : (
        <Card padded={false}>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Shift</th><th>Status</th><th>Reporter</th><th className="num">Activities</th><th>Weather</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/projects/${project.id}/reports/${r.id}`}>{fmtDate(r.report_date)}</Link></td>
                    <td>{r.shift}</td><td><ReportStatusBadge status={r.status} /></td>
                    <td>{r.reporter?.full_name || r.reporter?.email || "—"}</td>
                    <td className="num">{r.daily_report_lines?.[0]?.count ?? 0}</td><td className="text-sm text-ink-mute">{r.weather ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="flex items-center justify-between border-t border-steel-200 px-4 py-2 text-sm">
            <span className="text-ink-mute">{count ?? 0} reports · page {page} of {pages}</span>
            <span className="flex gap-2">{page > 1 && <Link className="btn btn-secondary" href={link(page - 1)}>Previous</Link>}{page < pages && <Link className="btn btn-secondary" href={link(page + 1)}>Next</Link>}</span>
          </div>
        </Card>
      )}
    </>
  );
}
