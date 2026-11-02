import { Dec } from "./decimal";
import type { ISODate, WorkCalendar } from "./dates";
import { baselineDurationWorkingDays, computeCpmFromActivities, type CpmResult } from "./cpm";
import { forecastProject, type ForecastOptions, type ProjectForecast } from "./forecast";
import { computeProgress, type ProgressOptions, type ProgressResult } from "./progress";
import type { ActivityInput, ActualEntry, Dependency } from "./types";

export type HealthStatus = "on_track" | "at_risk" | "delayed" | "unknown";

/**
 * Health is a POLICY classification layered over the numbers, not a measurement.
 * Thresholds are configurable and returned with the result so users can see
 * exactly why a project was classed as it was.
 */
export interface HealthThresholds {
  /** Progress variance (pp) at or below which a project is "at risk". Default -5 */
  atRiskVariancePp: number;
  /** Progress variance (pp) at or below which a project is "delayed". Default -10 */
  delayedVariancePp: number;
  /** Forecast delay (calendar days) at or above which a project is "delayed". Default 7 */
  delayedForecastDays: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  atRiskVariancePp: -5,
  delayedVariancePp: -10,
  delayedForecastDays: 7,
};

export interface HealthResult {
  status: HealthStatus;
  reasons: string[];
  thresholds: HealthThresholds;
}

export function classifyHealth(
  input: { progressVariancePp: Dec | null; forecastDelayDays: number | null; forecastUncertain: boolean },
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): HealthResult {
  const reasons: string[] = [];
  const v = input.progressVariancePp;
  if (v === null && input.forecastDelayDays === null) {
    return { status: "unknown", reasons: ["Not enough data to assess"], thresholds };
  }
  let status: HealthStatus = "on_track";
  if (v !== null && v.lte(thresholds.delayedVariancePp)) {
    status = "delayed";
    reasons.push(`Progress is ${v.abs().toFixed(1)} percentage points behind plan`);
  } else if (input.forecastDelayDays !== null && input.forecastDelayDays >= thresholds.delayedForecastDays) {
    status = "delayed";
    reasons.push(`Forecast finish is ${input.forecastDelayDays} calendar days after plan`);
  } else if (v !== null && v.lte(thresholds.atRiskVariancePp)) {
    status = "at_risk";
    reasons.push(`Progress is ${v.abs().toFixed(1)} percentage points behind plan`);
  } else if (input.forecastDelayDays !== null && input.forecastDelayDays >= 1) {
    status = "at_risk";
    reasons.push(`Forecast finish is ${input.forecastDelayDays} calendar days after plan`);
  } else if (input.forecastUncertain && v !== null && v.isNegative()) {
    status = "at_risk";
    reasons.push("Behind plan and the forecast finish is uncertain");
  }
  if (status === "on_track") reasons.push("Within thresholds");
  if (input.forecastUncertain) reasons.push("Forecast finish is uncertain: some activities lack enough reported data");
  return { status, reasons, thresholds };
}

export interface ProjectInput {
  activities: readonly ActivityInput[];
  dependencies: readonly Dependency[];
  entries: readonly ActualEntry[];
  cutoff: ISODate;
  calendar: WorkCalendar;
  forecastOptions?: ForecastOptions;
  progressOptions?: ProgressOptions;
  healthThresholds?: HealthThresholds;
}

export interface ProjectMetrics {
  cutoff: ISODate;
  /** Weighted roll-up, both capped at 100 per activity. null when no activity has a defined percentage. */
  plannedPct: Dec | null;
  actualPct: Dec | null;
  progressVariancePp: Dec | null;
  progress: Record<string, ProgressResult>;
  forecast: ProjectForecast;
  cpm: CpmResult;
  health: HealthResult;
}

export interface RollUp {
  plannedPct: Dec | null;
  actualPct: Dec | null;
  progressVariancePp: Dec | null;
}

/**
 * Weighted roll-up of activity percentages (both capped at 100 per activity).
 * Weights default to each activity's planned working days (explicit `weight` wins).
 * Percentages of different units are never added directly.
 */
export function rollUpProgress(
  activities: readonly ActivityInput[],
  progress: ReadonlyMap<string, ProgressResult>,
  calendar: WorkCalendar,
): RollUp {
  let wSum = Dec.ZERO;
  let plannedAcc = Dec.ZERO;
  let actualAcc = Dec.ZERO;
  for (const a of activities) {
    const r = progress.get(a.id);
    if (!r || r.plannedPct === null || r.actualPctCapped === null) continue;
    const w = a.weight !== undefined ? Dec.of(a.weight) : Dec.of(baselineDurationWorkingDays(a, calendar));
    if (!w.gt(0)) continue;
    wSum = wSum.add(w);
    plannedAcc = plannedAcc.add(Dec.min(r.plannedPct, Dec.HUNDRED).mul(w));
    actualAcc = actualAcc.add(r.actualPctCapped.mul(w));
  }
  const plannedPct = wSum.isZero() ? null : plannedAcc.div(wSum);
  const actualPct = wSum.isZero() ? null : actualAcc.div(wSum);
  return {
    plannedPct,
    actualPct,
    progressVariancePp: plannedPct !== null && actualPct !== null ? actualPct.sub(plannedPct) : null,
  };
}

export function computeProjectMetrics(input: ProjectInput): ProjectMetrics {
  const { activities, dependencies, entries, cutoff, calendar } = input;
  const progress: Record<string, ProgressResult> = {};
  const progressMap = new Map<string, ProgressResult>();
  for (const a of activities) {
    const r = computeProgress(a, entries, cutoff, calendar, input.progressOptions);
    progress[a.id] = r;
    progressMap.set(a.id, r);
  }

  const { plannedPct, actualPct, progressVariancePp: variance } = rollUpProgress(activities, progressMap, calendar);

  const forecast = forecastProject(
    activities,
    dependencies,
    entries,
    cutoff,
    calendar,
    input.forecastOptions,
    progressMap,
  );
  const cpm = computeCpmFromActivities(activities, dependencies, calendar);
  const health = classifyHealth(
    {
      progressVariancePp: variance,
      forecastDelayDays: forecast.status === "uncertain" ? null : forecast.estimatedDelayDays,
      forecastUncertain: forecast.status === "uncertain",
    },
    input.healthThresholds,
  );
  return { cutoff, plannedPct, actualPct, progressVariancePp: variance, progress, forecast, cpm, health };
}
