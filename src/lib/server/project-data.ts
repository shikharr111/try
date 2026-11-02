import "server-only";
import { computeProjectMetrics, type ProjectInput, type ProjectMetrics } from "../calc";
import { buildProjectInput, type DbBaselineRow, type DbDailyPlan, type DbDependency, type DbEntry, type DbHoliday } from "../data/mappers";
import { todayIn } from "../forms";
import type { ProjectRow, Supabase } from "./session";

const PAGE = 1000;

/** PostgREST caps responses (default 1000 rows). Page through every row so no report is silently ignored. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`Database read failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface BaselineRowFull extends DbBaselineRow {
  revision_id: string;
  revision_no: number;
  sort_order: number;
  wbs_node_id: string | null;
  planned_workers: number | string | null;
  planned_machine_hours: number | string | null;
}

export interface ProjectBundle {
  project: ProjectRow;
  cutoff: string;
  today: string;
  revisionId: string | null;
  revisionNo: number | null;
  baseline: BaselineRowFull[];
  holidays: DbHoliday[];
  input: ProjectInput;
  metrics: ProjectMetrics;
  codeById: Map<string, string>;
}

export async function loadProjectBundle(supabase: Supabase, project: ProjectRow, cutoffParam?: string | null): Promise<ProjectBundle> {
  const today = todayIn(project.timezone);
  const cutoff = cutoffParam && /^\d{4}-\d{2}-\d{2}$/.test(cutoffParam) ? cutoffParam : today;

  const [holidaysRes, baseline] = await Promise.all([
    supabase.from("project_holidays").select("holiday_date").eq("project_id", project.id),
    fetchAll<BaselineRowFull>((f, t) =>
      supabase.from("v_current_baseline").select("*").eq("project_id", project.id).order("sort_order").order("code").range(f, t),
    ),
  ]);
  const holidays = (holidaysRes.data ?? []) as DbHoliday[];
  const revisionId = baseline[0]?.revision_id ?? null;

  const [dependencies, dailyPlans, entries] = await Promise.all([
    revisionId
      ? fetchAll<DbDependency>((f, t) =>
          supabase.from("activity_dependencies").select("predecessor_id, successor_id, lag_working_days, dependency_type").eq("revision_id", revisionId).range(f, t))
      : Promise.resolve([] as DbDependency[]),
    revisionId
      ? fetchAll<DbDailyPlan>((f, t) =>
          supabase.from("daily_plans").select("activity_id, plan_date, planned_qty").eq("revision_id", revisionId).range(f, t))
      : Promise.resolve([] as DbDailyPlan[]),
    fetchAll<DbEntry>((f, t) =>
      supabase.from("v_actual_entries").select("activity_id, report_date, actual_qty, unit").eq("project_id", project.id).lte("report_date", cutoff).order("report_date").range(f, t)),
  ]);

  const input = buildProjectInput({ project, holidays, baseline, dailyPlans, dependencies, entries, cutoff });
  const metrics = computeProjectMetrics(input);
  return {
    project,
    cutoff,
    today,
    revisionId,
    revisionNo: baseline[0]?.revision_no ?? null,
    baseline,
    holidays,
    input,
    metrics,
    codeById: new Map(baseline.map((b) => [b.activity_id, b.code])),
  };
}
