import { NextResponse } from "next/server";
import { toCsv, type CsvCell } from "@/lib/csv/csv";
import { parseReportFilter, reportExportRows, type ReportExportLine } from "@/lib/export/reports";
import { getProjectContext } from "@/lib/server/session";
import { fetchAll } from "@/lib/server/project-data";
import { writeXlsx } from "@/lib/server/xlsx";
import { loadResourceRows } from "@/lib/server/resources-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Filtered export of data the caller can read (RLS applies). kind = reports | baseline | delays | workforce | equipment. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, project } = await getProjectContext(projectId);
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "reports";
  const f = parseReportFilter(u.searchParams);
  let rows: CsvCell[][];

  if (kind === "reports") {
    type L = { report_date: string; shift: string; planned_qty: number | null; actual_qty: number; unit: string; planned_workers: number | null; actual_workers: number | null; observations: string | null; activity: { code: string; name: string } | null; report: { status: string; weather: string | null; reviewed_at: string | null } };
    const data = await fetchAll<L>((from, to) => {
      let q = supabase.from("daily_report_lines").select("report_date, shift, planned_qty, actual_qty, unit, planned_workers, actual_workers, observations, activity:activities(code, name), report:daily_reports!inner(status, weather, reviewed_at)").eq("project_id", project.id);
      if (f.from) q = q.gte("report_date", f.from);
      if (f.to) q = q.lte("report_date", f.to);
      if (f.status) q = q.eq("report.status", f.status);
      if (f.activityId) q = q.eq("activity_id", f.activityId);
      return q.order("report_date").order("shift").range(from, to);
    });
    const lines: ReportExportLine[] = data.map((l) => ({
      report_date: l.report_date, shift: l.shift, status: l.report.status, activity_code: l.activity?.code ?? "", activity_name: l.activity?.name ?? "",
      unit: l.unit, planned_qty: l.planned_qty, actual_qty: l.actual_qty, planned_workers: l.planned_workers, actual_workers: l.actual_workers,
      weather: l.report.weather, observations: l.observations, reviewed_at: l.report.reviewed_at,
    }));
    rows = reportExportRows(lines);
  } else if (kind === "baseline") {
    const d = await fetchAll<Record<string, string | number | null>>((a, b) => supabase.from("v_current_baseline").select("code, name, unit, planned_start, planned_finish, total_qty, planned_workers, planned_machine_hours, revision_no").eq("project_id", project.id).order("sort_order").order("code").range(a, b));
    rows = [["code", "name", "unit", "planned_start", "planned_finish", "total_qty", "planned_workers", "planned_machine_hours", "revision_no"], ...d.map((r) => [r.code, r.name, r.unit, r.planned_start, r.planned_finish, r.total_qty, r.planned_workers, r.planned_machine_hours, r.revision_no])];
  } else if (kind === "delays") {
    const d = await fetchAll<{ category: string; start_date: string; end_date: string; duration_working_days: number | null; description: string; review_status: string; review_comment: string | null; activity: { code: string } | null }>((a, b) => {
      let q = supabase.from("delay_events").select("category, start_date, end_date, duration_working_days, description, review_status, review_comment, activity:activities(code)").eq("project_id", project.id);
      if (f.from) q = q.gte("start_date", f.from);
      if (f.to) q = q.lte("start_date", f.to);
      return q.order("start_date").range(a, b);
    });
    rows = [["category", "activity_code", "start_date", "end_date", "duration_working_days", "description", "review_status", "review_comment"], ...d.map((r) => [r.category, r.activity?.code ?? "", r.start_date, r.end_date, r.duration_working_days, r.description, r.review_status, r.review_comment])];
  } else if (kind === "workforce" || kind === "equipment") {
    const res = await loadResourceRows(supabase, project.id, f.to ?? "9999-12-31");
    const inRange = <T extends { report_date: string }>(x: T[]) => x.filter((r) => (!f.from || r.report_date >= f.from));
    rows = kind === "workforce"
      ? [["report_date", "planned_workers", "actual_workers"], ...inRange(res.workforce).map((r) => [r.report_date, r.planned_workers, r.actual_workers])]
      : [["report_date", "machine_type", "machine_count", "planned_hours", "operating_hours", "downtime_hours"], ...inRange(res.equipment).map((r) => [r.report_date, r.machine_type, r.machine_count, r.planned_hours, r.operating_hours, r.downtime_hours])];
  } else {
    return NextResponse.json({ error: "Unknown export." }, { status: 400 });
  }

  const base = `${project.code}-${kind}-${new Date().toISOString().slice(0, 10)}`.replace(/[^A-Za-z0-9._-]/g, "_");
  if (u.searchParams.get("format") === "xlsx") {
    const buf = await writeXlsx([{ name: kind, rows }]);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
  }
  return new NextResponse(toCsv(rows, { bom: true }), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
}
