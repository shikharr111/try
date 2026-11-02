import type { CsvCell } from "../csv/csv";

/** Row builders for CSV/Excel export of filtered data. Pure; the route handlers fetch with the user's RLS session. */

export interface ReportExportLine {
  report_date: string;
  shift: string;
  status: string;
  activity_code: string;
  activity_name: string;
  unit: string;
  planned_qty: number | string | null;
  actual_qty: number | string;
  planned_workers: number | string | null;
  actual_workers: number | string | null;
  weather: string | null;
  observations: string | null;
  reviewed_at: string | null;
}

export const REPORT_EXPORT_HEADERS = [
  "report_date", "shift", "status", "activity_code", "activity_name", "unit", "planned_qty", "actual_qty",
  "planned_workers", "actual_workers", "weather", "observations", "reviewed_at",
] as const;

export function reportExportRows(lines: readonly ReportExportLine[]): CsvCell[][] {
  return [
    [...REPORT_EXPORT_HEADERS],
    ...lines.map((l) => [
      l.report_date, l.shift, l.status, l.activity_code, l.activity_name, l.unit,
      l.planned_qty, l.actual_qty, l.planned_workers, l.actual_workers, l.weather, l.observations, l.reviewed_at,
    ]),
  ];
}

export interface ReportFilter {
  from?: string;
  to?: string;
  status?: string;
  activityId?: string;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["draft", "submitted", "approved", "rejected"];
/** Parses filter params from a URL; unknown or malformed values are dropped, never passed to the database. */
export function parseReportFilter(p: URLSearchParams): ReportFilter {
  const f: ReportFilter = {};
  const from = p.get("from");
  const to = p.get("to");
  const status = p.get("status");
  const activity = p.get("activity");
  if (from && DATE.test(from)) f.from = from;
  if (to && DATE.test(to)) f.to = to;
  if (status && STATUSES.includes(status)) f.status = status;
  if (activity && /^[0-9a-f-]{36}$/i.test(activity)) f.activityId = activity.toLowerCase();
  return f;
}
