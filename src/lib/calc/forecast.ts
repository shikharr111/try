import { Dec } from "./decimal";
import {
  addDays,
  addWorkingDays,
  compareDates,
  countWorkingDays,
  diffDays,
  maxDate,
  nextWorkingDay,
  onOrAfterWorkingDay,
  workingDayAt,
  type ISODate,
  type WorkCalendar,
} from "./dates";
import { computeProgress, entriesUpTo, type ProgressResult } from "./progress";
import { topologicalOrder, baselineDurationWorkingDays } from "./cpm";
import type { ActivityInput, ActualEntry, Dependency } from "./types";

export interface ForecastOptions {
  /** Trailing window (working days) used to measure recent productivity. Default 10. */
  windowWorkingDays?: number;
  /** Minimum distinct reporting days inside the window to trust a measured rate. Default 3. */
  minReportDays?: number;
}

export type ForecastConfidence = "high" | "medium" | "low";

export interface RecentProductivity {
  windowStart: ISODate;
  windowEnd: ISODate;
  reportedDays: number;
  /** Working days in the window (from first report or window start, whichever is later) */
  windowWorkingDays: number;
  /** reportedDays / windowWorkingDays, capped at 1 */
  coverage: number;
  qtyInWindow: Dec;
  /** qtyInWindow / reportedDays */
  ratePerReportedDay: Dec;
  /** stdev/mean of per-day totals (display-grade float statistic, used only to grade confidence) */
  coefficientOfVariation: number | null;
}

export interface ActivityForecast {
  activityId: string;
  /**
   * completed: all approved quantity reported
   * forecast: a finish date was projected
   * insufficient_data: no honest date can be given (see `reasons`)
   */
  status: "completed" | "forecast" | "insufficient_data";
  forecastFinish: ISODate | null;
  /** forecastFinish - plannedFinish in calendar days (positive = late, negative = early) */
  finishVarianceDays: number | null;
  /** max(0, finishVarianceDays) */
  estimatedDelayDays: number | null;
  ratePerWorkingDay: Dec | null;
  rateBasis: "recent_productivity" | "planned_rate" | null;
  confidence: ForecastConfidence | null;
  productivity: RecentProductivity | null;
  assumptions: string[];
  reasons: string[];
}

export interface ForecastContext {
  /** Earliest permitted start for an activity that has not started (e.g. from predecessors) */
  earliestStart?: ISODate;
  /** Permit falling back to the baseline average rate for activities that have not started */
  allowPlannedRate?: boolean;
}

export function recentProductivity(
  a: ActivityInput,
  entries: readonly ActualEntry[],
  cutoff: ISODate,
  projectCal: WorkCalendar,
  opts: ForecastOptions = {},
): RecentProductivity | null {
  const cal = a.calendar ?? projectCal;
  const W = opts.windowWorkingDays ?? 10;
  const minDays = opts.minReportDays ?? 3;
  const mine = entriesUpTo(a, entries, cutoff);
  if (mine.length === 0) return null;

  const nominalStart = addWorkingDays(cal, addDays(cutoff, 1), -W);
  const firstReport = mine[0].date;
  const windowStart = compareDates(nominalStart, firstReport) > 0 ? nominalStart : firstReport;

  const perDay = new Map<string, Dec>();
  for (const e of mine) {
    if (compareDates(e.date, windowStart) < 0) continue;
    perDay.set(e.date, (perDay.get(e.date) ?? Dec.ZERO).add(e.qty));
  }
  const reportedDays = perDay.size;
  if (reportedDays < minDays) return null;

  const qty = Dec.sum(perDay.values());
  const wd = Math.max(1, countWorkingDays(cal, windowStart, cutoff));
  const values = [...perDay.values()].map((d) => d.toNumber());
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let cv: number | null = null;
  if (mean > 0 && values.length > 1) {
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    cv = Math.sqrt(variance) / mean;
  }
  return {
    windowStart,
    windowEnd: cutoff,
    reportedDays,
    windowWorkingDays: wd,
    coverage: Math.min(1, reportedDays / wd),
    qtyInWindow: qty,
    ratePerReportedDay: qty.div(reportedDays),
    coefficientOfVariation: cv,
  };
}

function gradeConfidence(p: RecentProductivity): ForecastConfidence {
  if (p.reportedDays >= 5 && p.coverage >= 0.8 && (p.coefficientOfVariation ?? 0) <= 0.5) return "high";
  if (p.reportedDays >= 3 && p.coverage >= 0.5) return "medium";
  return "low";
}

function insufficient(id: string, reasons: string[]): ActivityForecast {
  return {
    activityId: id,
    status: "insufficient_data",
    forecastFinish: null,
    finishVarianceDays: null,
    estimatedDelayDays: null,
    ratePerWorkingDay: null,
    rateBasis: null,
    confidence: null,
    productivity: null,
    assumptions: [],
    reasons,
  };
}

/**
 * Forecast finish for one activity.
 *
 *   rate           = qty reported in the trailing window / reporting days in it
 *   remainingDays  = ceil(remaining quantity / rate)
 *   forecastFinish = the remainingDays-th working day starting at the next working
 *                    day after the cutoff (or `earliestStart` for unstarted work)
 *
 * When there is not enough reported data the result is `insufficient_data`
 * with a null date: no date is invented.
 */
export function forecastActivity(
  a: ActivityInput,
  entries: readonly ActualEntry[],
  cutoff: ISODate,
  projectCal: WorkCalendar,
  opts: ForecastOptions = {},
  ctx: ForecastContext = {},
  precomputed?: ProgressResult,
): ActivityForecast {
  const cal = a.calendar ?? projectCal;
  const prog = precomputed ?? computeProgress(a, entries, cutoff, projectCal);
  const minDays = opts.minReportDays ?? 3;

  if (prog.totalQty.isZero()) {
    return insufficient(a.id, ["Total approved quantity is zero; quantity-based forecasting is not applicable"]);
  }

  if (prog.remainingQty.isZero()) {
    const done = prog.completionDate!;
    const variance = diffDays(a.plannedFinish, done);
    return {
      activityId: a.id,
      status: "completed",
      forecastFinish: done,
      finishVarianceDays: variance,
      estimatedDelayDays: Math.max(0, variance),
      ratePerWorkingDay: null,
      rateBasis: null,
      confidence: "high",
      productivity: null,
      assumptions: [],
      reasons: [],
    };
  }

  const started = prog.actualCumQty.gt(0);
  const prod = recentProductivity(a, entries, cutoff, projectCal, opts);
  const assumptions: string[] = [];
  let rate: Dec;
  let basis: "recent_productivity" | "planned_rate";
  let confidence: ForecastConfidence;

  if (prod) {
    if (prod.ratePerReportedDay.isZero()) {
      return insufficient(a.id, [
        "Recent reports show zero progress; a finish date cannot be projected until work resumes",
      ]);
    }
    rate = prod.ratePerReportedDay;
    basis = "recent_productivity";
    confidence = gradeConfidence(prod);
    assumptions.push(
      `Recent productivity of ${rate.toFixed(3)} ${a.unit} per working day (${prod.reportedDays} reporting days in the last ${prod.windowWorkingDays} working days) continues unchanged`,
    );
    if (prod.coverage < 1) {
      assumptions.push(
        `Only ${Math.round(prod.coverage * 100)}% of working days in the window have reports; unreported days are not counted as zero output`,
      );
    }
  } else if (!started && ctx.allowPlannedRate && compareDates(cutoff, a.plannedStart) < 0) {
    // Only for work that is not yet due. If it should already have started but nothing is
    // reported, we cannot tell "not started" from "not reported", so no date is invented.
    const wd = baselineDurationWorkingDays(a, projectCal);
    if (wd === 0) return insufficient(a.id, ["Planned span contains no working days"]);
    rate = prog.totalQty.div(wd);
    basis = "planned_rate";
    confidence = "low";
    assumptions.push(
      `Activity has not started; the baseline average of ${rate.toFixed(3)} ${a.unit} per working day is assumed`,
    );
  } else {
    return insufficient(a.id, [
      started
        ? `Fewer than ${minDays} reporting days in the recent window; recent productivity cannot be measured`
        : compareDates(cutoff, a.plannedStart) >= 0
          ? "Activity was due to start but no progress is reported; it may not have started or reports may be missing"
          : "No progress reported yet; there is no productivity to project from",
    ]);
  }

  // Work resumes the next working day after the cutoff; unstarted work also waits for its planned start / logic.
  let start = nextWorkingDay(cal, cutoff);
  if (!started) {
    start = maxDate([start, onOrAfterWorkingDay(cal, a.plannedStart)]);
    if (ctx.earliestStart) start = maxDate([start, onOrAfterWorkingDay(cal, ctx.earliestStart)]);
  }
  const daysNeeded = Math.max(1, prog.remainingQty.div(rate).ceilToInt());
  const finish = workingDayAt(cal, start, daysNeeded - 1);
  const variance = diffDays(a.plannedFinish, finish);
  assumptions.push(`Working calendar: ${cal.workingWeekdays.length}-day week with ${cal.holidays.length} listed holidays`);

  return {
    activityId: a.id,
    status: "forecast",
    forecastFinish: finish,
    finishVarianceDays: variance,
    estimatedDelayDays: Math.max(0, variance),
    ratePerWorkingDay: rate,
    rateBasis: basis,
    confidence,
    productivity: prod,
    assumptions,
    reasons: [],
  };
}

export interface ProjectForecast {
  plannedFinish: ISODate | null;
  /** Latest activity forecast finish; null when any activity is uncertain */
  forecastFinish: ISODate | null;
  /** Latest finish among activities that do have a forecast (a lower bound when status is uncertain) */
  latestKnownFinish: ISODate | null;
  /** max(0, forecastFinish - plannedFinish) in calendar days; null when uncertain */
  estimatedDelayDays: number | null;
  status: "completed" | "forecast" | "uncertain";
  activities: Record<string, ActivityForecast>;
  uncertainActivityIds: string[];
  assumptions: string[];
}

/**
 * Project forecast propagated through finish-to-start logic.
 * An unstarted activity cannot begin before every predecessor's forecast
 * finish (+ lag). If any predecessor is uncertain, so are its successors.
 */
export function forecastProject(
  activities: readonly ActivityInput[],
  deps: readonly Dependency[],
  entries: readonly ActualEntry[],
  cutoff: ISODate,
  projectCal: WorkCalendar,
  opts: ForecastOptions = {},
  progressById?: ReadonlyMap<string, ProgressResult>,
): ProjectForecast {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const order = topologicalOrder(
    activities.map((a) => a.id),
    deps,
  );
  const predsOf = new Map<string, Dependency[]>(activities.map((a) => [a.id, []]));
  for (const d of deps) predsOf.get(d.successorId)!.push(d);

  const results: Record<string, ActivityForecast> = {};
  const finishOf = new Map<string, ISODate | null>();

  for (const id of order) {
    const a = byId.get(id)!;
    const cal = a.calendar ?? projectCal;
    const prog = progressById?.get(id) ?? computeProgress(a, entries, cutoff, projectCal);
    const started = prog.actualCumQty.gt(0);
    const preds = predsOf.get(id)!;

    let earliest: ISODate | undefined;
    const uncertainPreds: string[] = [];
    for (const d of preds) {
      const pf = finishOf.get(d.predecessorId) ?? null;
      if (pf === null) {
        uncertainPreds.push(d.predecessorId);
        continue;
      }
      const lag = d.lagWorkingDays ?? 0;
      const candidate = addWorkingDays(cal, pf, 1 + lag);
      earliest = earliest === undefined ? candidate : maxDate([earliest, candidate]);
    }

    // Milestone-style activity (no quantity): finishes when its logic allows.
    if (prog.totalQty.isZero()) {
      if (uncertainPreds.length > 0) {
        results[id] = insufficient(id, [`Predecessor forecast is uncertain: ${uncertainPreds.join(", ")}`]);
        finishOf.set(id, null);
      } else {
        let finish = a.plannedFinish;
        for (const d of preds) {
          const pf = finishOf.get(d.predecessorId)!;
          finish = maxDate([finish, addWorkingDays(cal, pf, d.lagWorkingDays ?? 0)]);
        }
        const variance = diffDays(a.plannedFinish, finish);
        results[id] = {
          ...insufficient(id, []),
          status: "forecast",
          forecastFinish: finish,
          finishVarianceDays: variance,
          estimatedDelayDays: Math.max(0, variance),
          confidence: preds.length === 0 ? "low" : "medium",
          assumptions: ["Zero-quantity milestone: date follows predecessor forecast finishes"],
          reasons: [],
        };
        finishOf.set(id, finish);
      }
      continue;
    }

    if (!started && uncertainPreds.length > 0 && prog.remainingQty.gt(0)) {
      results[id] = insufficient(id, [`Predecessor forecast is uncertain: ${uncertainPreds.join(", ")}`]);
      finishOf.set(id, null);
      continue;
    }

    const f = forecastActivity(a, entries, cutoff, projectCal, opts, { earliestStart: earliest, allowPlannedRate: true }, prog);
    results[id] = f;
    finishOf.set(id, f.forecastFinish);
  }

  const known = [...finishOf.values()].filter((d): d is ISODate => d !== null);
  const uncertain = order.filter((id) => results[id].status === "insufficient_data");
  const plannedFinish = activities.length > 0 ? maxDate(activities.map((a) => a.plannedFinish)) : null;
  const latestKnown = known.length > 0 ? maxDate(known) : null;
  const allCompleted = order.length > 0 && order.every((id) => results[id].status === "completed");

  let status: ProjectForecast["status"];
  let forecastFinish: ISODate | null = null;
  if (uncertain.length > 0 || order.length === 0) status = "uncertain";
  else if (allCompleted) status = "completed";
  else status = "forecast";
  if (status !== "uncertain") forecastFinish = latestKnown;

  return {
    plannedFinish,
    forecastFinish,
    latestKnownFinish: latestKnown,
    estimatedDelayDays:
      forecastFinish !== null && plannedFinish !== null ? Math.max(0, diffDays(plannedFinish, forecastFinish)) : null,
    status,
    activities: results,
    uncertainActivityIds: uncertain,
    assumptions: [
      "Finish-to-start logic only; other dependency types are not modelled",
      "Unstarted activities cannot begin before their planned start or their predecessors' forecast finish",
      "Unreported working days are not treated as zero production",
    ],
  };
}
