import "server-only";
import { fetchAll } from "./project-data";
import type { Supabase } from "./session";
import type { EquipmentRow, WorkforceRow } from "../ai/resources";

/** Workforce / equipment rows that belong to SUBMITTED or APPROVED reports only (same rule as progress). */
export async function loadResourceRows(supabase: Supabase, projectId: string, cutoff: string) {
  const [workforce, equipment] = await Promise.all([
    fetchAll<WorkforceRow>((f, t) =>
      supabase.from("workforce_records").select("report_date, planned_workers, actual_workers, report:daily_reports!inner(status)")
        .eq("project_id", projectId).lte("report_date", cutoff).in("report.status", ["submitted", "approved"]).order("report_date").range(f, t)),
    fetchAll<EquipmentRow>((f, t) =>
      supabase.from("equipment_records").select("report_date, machine_type, machine_count, planned_hours, operating_hours, downtime_hours, report:daily_reports!inner(status)")
        .eq("project_id", projectId).lte("report_date", cutoff).in("report.status", ["submitted", "approved"]).order("report_date").range(f, t)),
  ]);
  return { workforce, equipment };
}
