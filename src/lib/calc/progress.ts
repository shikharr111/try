import { Dec, pct } from "./decimal";
import {
  compareDates,
  countWorkingDays,
  diffDays,
  isValidISODate,
  workingDayAt,
  type ISODate,
  type WorkCalendar,
  addDays,
} from "./dates";
import { CalcInputError, type ActivityInput, type ActualEntry } from "./types";
import { assertUnitsMatch } from "./units";

export type ProgressFlag =
  | "ZERO_TOTAL_QTY" // total approved quantity is 0: percentages undefined
  | "NOT_YET_PLANNED" // cutoff is before the planned start
  | "NO_REPORTS" // activity should have started but nothing is reported
  | "STALE_REPORTS" // incomplete activity without a report for N working days
  | "PARTIAL_PERIOD" // cutoff falls inside the planned span
  | "AHEAD_OF_SCHEDULE" // actual cumulative > planned cumulative
  | "OVER_COMPLETED" // actual cumulative > total approved quantity
  | "MULTIPLE_ENTRIES_SAME_DAY"; // several entries on one date were summed

export interface ProgressResult {
  activityId: string;
  cutoff: ISODate;
  unit: string;
  totalQty: Dec;
  plannedCumQty: Dec;
  actualCumQty: Dec;
  /** completed / total * 100 (uncapped); null when total is zero */
  plannedPct: Dec | null;
  actualPct: Dec | null;
  /** actualPct capped at 100, used for roll-ups */
  actualPctCapped: Dec | null;
  /** actualPct - plannedPct, percentage points. Negative = behind. */
  progressVariancePp: Dec | null;
  /** max(0, planned - actual) / planned * 100; null when nothing was planned yet */
  shortfallPct: Dec | null;
  /** max(0, total - actual) */
  remainingQty: Dec;
  /** max(0, actual - total) */
  overCompletedQty: Dec;
  /** Earned-schedule variance in working days (actual-equivalent minus elapsed). Negative = behind. */
  scheduleVarianceDays: Dec | null;
  lastReportDate: ISODate | null;
  /** Date cumulative actual first reached the total, if it did */
  completionDate: ISODate | null;
  reportedDays: number;
  flags: ProgressFlag[];
}

export interface ProgressOptions {
  /** Working days without a report before an incomplete activity is flagged stale. Default 3. */
  staleAfterWorkingDays?: number;
}

/** Hard validation of an activity baseline. Throws CalcInputError. */
export function assertValidActivity(a: ActivityInput): void {
  if (!isValidISODate(a.plannedStart) || !isValidISODate(a.plannedFinish)) {
    throw new CalcInputError(`Activity ${a.id}: invalid planned dates`);
  }
  if (compareDates(a.plannedFinish, a.plannedStart) < 0) {
    throw new CalcInputError(`Activity ${a.id}: planned finish is before planned start`);
  }
  if (Dec.of(a.totalQty).isNegative()) {
    throw new CalcInputError(`Activity ${a.id}: total quantity is negative`);
  }
  for (const p of a.dailyPlan ?? []) {
    if (!isValidISODate(p.date)) throw new CalcInputError(`Activity ${a.id}: invalid daily plan date "${p.date}"`);
    if (Dec.of(p.qty).isNegative()) throw new CalcInputError(`Activity ${a.id}: negative daily plan quantity on ${p.date}`);
  }
}

/**
 * Planned cumulative quantity at `cutoff`.
 *  - explicit dailyPlan: sum of planned quantities dated <= cutoff
 *  - otherwise linear over the activity's working days:
 *      total * workingDays(start..cutoff) / workingDays(start..finish)
 *    (0 before start, total on/after finish)
 */
export function plannedCumulativeQty(a: ActivityInput, cutoff: ISODate, projectCal: WorkCalendar): Dec {
  const total = Dec.of(a.totalQty);
  if (a.dailyPlan && a.dailyPlan.length > 0) {
    return Dec.sum(a.dailyPlan.filter((p) => compareDates(p.date, cutoff) <= 0).map((p) => p.qty));
  }
  if (compareDates(cutoff, a.plannedStart) < 0) return Dec.ZERO;
  if (compareDates(cutoff, a.plannedFinish) >= 0) return total;
  const cal = a.calendar ?? projectCal;
  const wdTotal = countWorkingDays(cal, a.plannedStart, a.plannedFinish);
  if (wdTotal === 0) return Dec.ZERO;
  const wdDone = countWorkingDays(cal, a.plannedStart, cutoff);
  return total.mul(wdDone).div(wdTotal);
}

/** Entries for one activity dated <= cutoff, validated, sorted by date. */
export function entriesUpTo(a: ActivityInput, entries: readonly ActualEntry[], cutoff: ISODate): ActualEntry[] {
  const mine: ActualEntry[] = [];
  for (const e of entries) {
    if (e.activityId !== a.id) continue;
    if (!isValidISODate(e.date)) throw new CalcInputError(`Activity ${a.id}: invalid report date "${e.date}"`);
    if (compareDates(e.date, cutoff) > 0) continue;
    assertUnitsMatch(a.id, a.unit, e.unit);
    if (Dec.of(e.qty).isNegative()) {
      throw new CalcInputError(`Activity ${a.id}: negative reported quantity on ${e.date}; correct the report instead`);
    }
    mine.push(e);
  }
  return mine.sort((x, y) => compareDates(x.date, y.date));
}

/** Working-day index (fractional) on the baseline at which planned cumulative equals `actual`. */
function earnedScheduleDays(a: ActivityInput, actual: Dec, projectCal: WorkCalendar): Dec {
  const total = Dec.of(a.totalQty);
  const cal = a.calendar ?? projectCal;
  const wdTotal = countWorkingDays(cal, a.plannedStart, a.plannedFinish);
  if (actual.lte(0)) return Dec.ZERO;
  if (actual.gte(total)) return Dec.of(wdTotal);
  if (!a.dailyPlan || a.dailyPlan.length === 0) {
    return Dec.of(wdTotal).mul(actual).div(total); // exact for linear plans
  }
  let prev = Dec.ZERO;
  for (let k = 1; k <= wdTotal; k++) {
    const cum = plannedCumulativeQty(a, workingDayAt(cal, a.plannedStart, k - 1), projectCal);
    if (cum.gte(actual)) {
      const step = cum.sub(prev);
      const frac = step.isZero() ? Dec.ZERO : actual.sub(prev).div(step);
      return Dec.of(k - 1).add(frac);
    }
    prev = cum;
  }
  return Dec.of(wdTotal);
}

export function computeProgress(
  a: ActivityInput,
  entries: readonly ActualEntry[],
  cutoff: ISODate,
  projectCal: WorkCalendar,
  opts: ProgressOptions = {},
): ProgressResult {
  assertValidActivity(a);
  if (!isValidISODate(cutoff)) throw new CalcInputError(`Invalid cutoff date "${cutoff}"`);
  const cal = a.calendar ?? projectCal;
  const staleAfter = opts.staleAfterWorkingDays ?? 3;
  const flags: ProgressFlag[] = [];

  const total = Dec.of(a.totalQty);
  const planned = plannedCumulativeQty(a, cutoff, projectCal);
  const mine = entriesUpTo(a, entries, cutoff);

  // cumulative actual + completion date + same-day duplicates
  let actual = Dec.ZERO;
  let completionDate: ISODate | null = null;
  const seenDates = new Set<string>();
  let sameDay = false;
  for (const e of mine) {
    if (seenDates.has(e.date)) sameDay = true;
    seenDates.add(e.date);
    actual = actual.add(e.qty);
    if (completionDate === null && total.gt(0) && actual.gte(total)) completionDate = e.date;
  }
  if (sameDay) flags.push("MULTIPLE_ENTRIES_SAME_DAY");

  const lastReportDate = mine.length > 0 ? mine[mine.length - 1].date : null;

  const plannedPct = pct(planned, total);
  const actualPct = pct(actual, total);
  const actualPctCapped = actualPct === null ? null : Dec.min(actualPct, Dec.HUNDRED);
  const variance = plannedPct !== null && actualPct !== null ? actualPct.sub(plannedPct) : null;
  const shortfall = planned.isZero() ? null : Dec.max(0, planned.sub(actual)).div(planned).mul(Dec.HUNDRED);

  const remaining = Dec.max(0, total.sub(actual));
  const over = Dec.max(0, actual.sub(total));

  // flags
  if (total.isZero()) flags.push("ZERO_TOTAL_QTY");
  if (compareDates(cutoff, a.plannedStart) < 0) flags.push("NOT_YET_PLANNED");
  else if (compareDates(cutoff, a.plannedFinish) < 0) flags.push("PARTIAL_PERIOD");
  if (actual.gt(planned)) flags.push("AHEAD_OF_SCHEDULE");
  if (total.gt(0) && actual.gt(total)) flags.push("OVER_COMPLETED");
  const shouldHaveStarted = compareDates(cutoff, a.plannedStart) >= 0;
  if (shouldHaveStarted && total.gt(0) && actual.lt(total)) {
    if (lastReportDate === null) flags.push("NO_REPORTS");
    else if (countWorkingDays(cal, addDays(lastReportDate, 1), cutoff) >= staleAfter) flags.push("STALE_REPORTS");
  }

  // schedule variance (earned schedule, working days)
  let svDays: Dec | null = null;
  if (total.gt(0)) {
    const es = earnedScheduleDays(a, actual, projectCal);
    const at = Dec.of(countWorkingDays(cal, a.plannedStart, cutoff));
    svDays = es.sub(at);
  }

  return {
    activityId: a.id,
    cutoff,
    unit: a.unit,
    totalQty: total,
    plannedCumQty: planned,
    actualCumQty: actual,
    plannedPct,
    actualPct,
    actualPctCapped,
    progressVariancePp: variance,
    shortfallPct: shortfall,
    remainingQty: remaining,
    overCompletedQty: over,
    scheduleVarianceDays: svDays,
    lastReportDate,
    completionDate,
    reportedDays: seenDates.size,
    flags,
  };
}

/** Calendar days the cutoff lies past the planned finish (0 if not past). Used by health rules. */
export function daysPastPlannedFinish(a: ActivityInput, cutoff: ISODate): number {
  return Math.max(0, diffDays(a.plannedFinish, cutoff));
}
