import "server-only";
import { buildResources } from "../ai/resources";
import { buildSnapshot, MAX_DELAY_EVENTS, MAX_REPORT_LINES, type MetricSnapshot, type SnapshotDelayEvent, type SnapshotReportLine } from "../ai/snapshot";
import type { ProjectBundle } from "./project-data";
import { loadResourceRows } from "./resources-data";
import type { Supabase } from "./session";

/** Collects the deterministic metric snapshot for one project with the caller's own RLS session. */
export async function collectSnapshot(supabase: Supabase, b: ProjectBundle): Promise<MetricSnapshot> {
  const project = b.project;
  const [{ data: ev }, { data: lines }, res] = await Promise.all([
    supabase.from("delay_events").select("id, activity_id, category, start_date, end_date, duration_working_days, review_status, description, evidence")
      .eq("project_id", project.id).lte("start_date", b.cutoff).order("start_date", { ascending: false }).limit(MAX_DELAY_EVENTS),
    supabase.from("daily_report_lines").select("report_date, activity_id, actual_qty, planned_qty, planned_workers, actual_workers, observations, report:daily_reports!inner(status)")
      .eq("project_id", project.id).lte("report_date", b.cutoff).in("report.status", ["submitted", "approved"])
      .order("report_date", { ascending: false }).limit(MAX_REPORT_LINES),
    loadResourceRows(supabase, project.id, b.cutoff),
  ]);
  const code = (id: string | null) => (id ? b.codeById.get(id) ?? null : null);
  const delayEvents: SnapshotDelayEvent[] = (ev ?? []).map((e) => ({
    id: e.id as string, activity_code: code(e.activity_id as string | null), category: e.category as string, start_date: e.start_date as string, end_date: e.end_date as string,
    duration_working_days: e.duration_working_days as number | null, review_status: e.review_status as SnapshotDelayEvent["review_status"],
    description: e.description as string, evidence: (e.evidence as string | null) ?? null,
  }));
  const recent: SnapshotReportLine[] = (lines ?? []).map((l) => ({
    report_date: l.report_date as string, activity_code: code(l.activity_id as string) ?? "?", actual_qty: l.actual_qty as number, planned_qty: l.planned_qty as number | null,
    planned_workers: l.planned_workers as number | null, actual_workers: l.actual_workers as number | null, observation: (l.observations as string | null) ?? null,
  }));
  return buildSnapshot({
    project: { name: project.name, code: project.code, currency: project.currency, planned_start: project.planned_start, planned_finish: project.planned_finish, budget: project.budget },
    input: b.input, metrics: b.metrics, codeById: b.codeById, delayEvents, recentReportLines: recent,
    resources: buildResources(res.workforce, res.equipment, b.cutoff),
  });
}
