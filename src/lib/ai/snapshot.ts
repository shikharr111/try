import type { ProjectInput, ProjectMetrics } from "../calc";

/**
 * The metric snapshot is the ONLY project information the model receives, and it is stored verbatim with
 * every analysis. It contains deterministic engine output (as strings), structure, confirmed/unconfirmed
 * delay events and a short window of recent report text. It deliberately contains no emails, no user ids
 * and no person names: individuals are never identifiable to the model, so blame cannot be attributed.
 */

export interface SnapshotDelayEvent {
  id: string;
  activity_code: string | null;
  category: string;
  start_date: string;
  end_date: string;
  duration_working_days: number | string | null;
  review_status: "unreviewed" | "confirmed" | "dismissed";
  description: string;
  evidence: string | null;
}
export interface SnapshotReportLine {
  report_date: string;
  activity_code: string;
  actual_qty: number | string;
  planned_qty: number | string | null;
  planned_workers: number | string | null;
  actual_workers: number | string | null;
  observation: string | null;
}
export interface SnapshotResources {
  workforce: { plannedPersonDays: string; actualPersonDays: string; variancePct: string | null; comparedDays: number; unreportedDays: number };
  machines: { plannedHours: string; operatingHours: string; downtimeHours: string; utilizationPct: string | null; downtimePct: string | null };
  observedPeakWorkersOnAnyDay: number | null;
  observedMaxMachinesByType: Record<string, number>;
}

export const MAX_UNTRUSTED_CHARS = 300;
export const MAX_REPORT_LINES = 60;
export const MAX_DELAY_EVENTS = 40;

/** Truncate and strip control characters from free text that came from site users. */
export function cleanUntrusted(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (t === "") return null;
  return t.length > MAX_UNTRUSTED_CHARS ? t.slice(0, MAX_UNTRUSTED_CHARS) + "…" : t;
}

export interface BuildSnapshotArgs {
  project: {
    name: string;
    code: string;
    currency: string;
    planned_start: string;
    planned_finish: string;
    budget: number | string | null;
  };
  input: ProjectInput;
  metrics: ProjectMetrics;
  codeById: ReadonlyMap<string, string>;
  delayEvents: readonly SnapshotDelayEvent[];
  recentReportLines: readonly SnapshotReportLine[];
  resources: SnapshotResources;
}

const s = (d: { toString(): string } | null | undefined): string | null => (d === null || d === undefined ? null : d.toString());
const f = (d: { toFixed(n: number): string } | null | undefined, dp = 2): string | null => (d === null || d === undefined ? null : d.toFixed(dp));

export function buildSnapshot(a: BuildSnapshotArgs) {
  const { input, metrics, codeById } = a;
  const code = (id: string) => codeById.get(id) ?? id;

  const activities: Record<string, unknown> = {};
  for (const act of input.activities) {
    const p = metrics.progress[act.id];
    const fc = metrics.forecast.activities[act.id];
    const cpm = metrics.cpm.activities[act.id];
    const c = code(act.id);
    activities[c] = {
      name: act.name,
      unit: act.unit,
      total_qty: act.totalQty,
      planned_start: act.plannedStart,
      planned_finish: act.plannedFinish,
      progress: {
        planned_cum_qty: f(p.plannedCumQty, 2),
        actual_cum_qty: f(p.actualCumQty, 2),
        planned_pct: f(p.plannedPct, 1),
        actual_pct: f(p.actualPct, 1),
        progress_variance_pp: f(p.progressVariancePp, 1),
        shortfall_pct: f(p.shortfallPct, 1),
        remaining_qty: f(p.remainingQty, 2),
        schedule_variance_working_days: f(p.scheduleVarianceDays, 1),
        last_report_date: p.lastReportDate,
        reporting_days: p.reportedDays,
      },
      forecast: {
        status: fc.status,
        forecast_finish: fc.forecastFinish,
        finish_variance_calendar_days: fc.finishVarianceDays,
        estimated_delay_calendar_days: fc.estimatedDelayDays,
        confidence: fc.confidence,
        rate_per_working_day: f(fc.ratePerWorkingDay, 3),
        rate_basis: fc.rateBasis,
        assumptions: fc.assumptions,
        reasons_uncertain: fc.reasons,
      },
      schedule_logic: {
        critical: cpm?.critical ?? false,
        total_float_working_days: cpm?.totalFloat ?? null,
        predecessors: input.dependencies.filter((d) => d.successorId === act.id).map((d) => code(d.predecessorId)),
        successors: input.dependencies.filter((d) => d.predecessorId === act.id).map((d) => code(d.successorId)),
      },
      data_flags: p.flags,
    };
  }

  const dataQuality: string[] = [];
  if (metrics.forecast.status === "uncertain") dataQuality.push("The project forecast finish is uncertain for the activities listed in project_metrics.forecast.uncertain_activity_codes.");
  for (const act of input.activities) {
    const flags = metrics.progress[act.id].flags;
    if (flags.includes("NO_REPORTS")) dataQuality.push(`${code(act.id)}: due to have started but has no reports.`);
    if (flags.includes("STALE_REPORTS")) dataQuality.push(`${code(act.id)}: no recent reports on an incomplete activity.`);
    if (flags.includes("OVER_COMPLETED")) dataQuality.push(`${code(act.id)}: reported quantity exceeds the approved total.`);
  }
  if (a.resources.workforce.unreportedDays > 0) dataQuality.push(`${a.resources.workforce.unreportedDays} planned workforce day(s) have no reported actual headcount.`);
  dataQuality.push("No cost, rate or productivity-norm data is provided: costs cannot be estimated.");
  dataQuality.push("No data on available workforce pool, equipment fleet, or subcontractor capacity is provided.");

  const events = a.delayEvents
    .filter((e) => e.review_status !== "dismissed")
    .slice(0, MAX_DELAY_EVENTS)
    .map((e) => ({
      id: e.id,
      activity_code: e.activity_code,
      category: e.category,
      start_date: e.start_date,
      end_date: e.end_date,
      duration_working_days: e.duration_working_days === null ? null : String(e.duration_working_days),
      review_status: e.review_status,
      description_untrusted: cleanUntrusted(e.description),
      evidence_untrusted: cleanUntrusted(e.evidence),
    }));

  const lines = a.recentReportLines.slice(0, MAX_REPORT_LINES).map((l) => ({
    report_date: l.report_date,
    activity_code: l.activity_code,
    actual_qty: String(l.actual_qty),
    planned_qty: l.planned_qty === null ? null : String(l.planned_qty),
    planned_workers: l.planned_workers === null ? null : String(l.planned_workers),
    actual_workers: l.actual_workers === null ? null : String(l.actual_workers),
    observation_untrusted: cleanUntrusted(l.observation),
  }));

  return {
    schema_version: 1 as const,
    project: {
      name: a.project.name,
      code: a.project.code,
      currency: a.project.currency,
      planned_start: a.project.planned_start,
      planned_finish: a.project.planned_finish,
      working_weekdays: input.calendar.workingWeekdays,
      holidays: input.calendar.holidays,
    },
    cutoff: input.cutoff,
    project_metrics: {
      planned_pct: f(metrics.plannedPct, 1),
      actual_pct: f(metrics.actualPct, 1),
      progress_variance_pp: f(metrics.progressVariancePp, 1),
      health: { status: metrics.health.status, reasons: metrics.health.reasons },
      forecast: {
        status: metrics.forecast.status,
        planned_finish: metrics.forecast.plannedFinish,
        forecast_finish: metrics.forecast.forecastFinish,
        latest_known_finish: metrics.forecast.latestKnownFinish,
        estimated_delay_calendar_days: metrics.forecast.estimatedDelayDays,
        uncertain_activity_codes: metrics.forecast.uncertainActivityIds.map(code),
        assumptions: metrics.forecast.assumptions,
      },
      critical_activity_codes: metrics.cpm.criticalActivityIds.map(code),
      baseline_duration_working_days: metrics.cpm.projectDurationWorkingDays,
    },
    activities,
    delay_events: events,
    recent_report_lines: lines,
    resources: {
      workforce: a.resources.workforce,
      machines: a.resources.machines,
      observed_peak_workers_on_any_day: a.resources.observedPeakWorkersOnAnyDay,
      observed_max_machines_by_type: a.resources.observedMaxMachinesByType,
    },
    data_quality: dataQuality,
  };
}

export type MetricSnapshot = ReturnType<typeof buildSnapshot>;

/** Resolves a dotted path such as "activities.FND.progress.actual_pct" against a snapshot. */
export function resolveRef(snapshot: unknown, ref: string): { found: boolean; value?: unknown } {
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 200) return { found: false };
  // Keys may themselves contain dots (activity codes are free text), so try the longest matching key first.
  const walk = (cur: unknown, parts: string[]): { found: boolean; value?: unknown } => {
    if (parts.length === 0) return { found: true, value: cur };
    if (typeof cur !== "object" || cur === null) return { found: false };
    for (let k = parts.length; k >= 1; k--) {
      const key = parts.slice(0, k).join(".");
      if (Object.prototype.hasOwnProperty.call(cur, key)) {
        const r = walk((cur as Record<string, unknown>)[key], parts.slice(k));
        if (r.found) return r;
      }
    }
    return { found: false };
  };
  return walk(snapshot, ref.split("."));
}
