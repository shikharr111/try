import {
  Dec,
  addDays,
  compareDates,
  countWorkingDays,
  computeProgress,
  fromEpochDay,
  rollUpProgress,
  toEpochDay,
  weekday,
  type ISODate,
  type ProgressResult,
  type ProjectInput,
  type ProjectMetrics,
  type WorkCalendar,
} from "../calc";

export type Granularity = "daily" | "weekly" | "monthly";

/** Display-grade number from a Dec (charts only; never fed back into calculations). */
export const num = (d: Dec | null | undefined, dp = 1): number | null =>
  d === null || d === undefined ? null : Number(d.toFixed(dp));

/** Sample dates in [start, end]: every day, every Sunday (week end), or every month end; always includes `end`. */
export function sampleDates(start: ISODate, end: ISODate, g: Granularity): ISODate[] {
  if (compareDates(end, start) < 0) return [];
  const s = toEpochDay(start);
  const e = toEpochDay(end);
  const out: ISODate[] = [];
  for (let d = s; d <= e; d++) {
    const iso = fromEpochDay(d);
    const isLast = d === e;
    if (g === "daily") out.push(iso);
    else if (g === "weekly") {
      if (weekday(iso) === 0 || isLast) out.push(iso);
    } else {
      const next = fromEpochDay(d + 1);
      if (next.slice(0, 7) !== iso.slice(0, 7) || isLast) out.push(iso);
    }
  }
  return out;
}

export interface SeriesPoint {
  date: ISODate;
  plannedPct: number | null;
  /** null for dates after `actualUntil` (the future has no actuals) */
  actualPct: number | null;
  variancePp: number | null;
}

/**
 * Planned vs actual cumulative progress over time. Every point is computed with the same engine and the
 * same cutoff for planned and actual, so the S-curve agrees exactly with the dashboard KPIs.
 */
export function progressSeries(
  input: Omit<ProjectInput, "cutoff">,
  dates: readonly ISODate[],
  actualUntil: ISODate,
): SeriesPoint[] {
  return dates.map((date) => {
    const map = new Map<string, ProgressResult>();
    for (const a of input.activities) {
      map.set(a.id, computeProgress(a, input.entries, date, input.calendar, input.progressOptions));
    }
    const r = rollUpProgress(input.activities, map, input.calendar);
    const future = compareDates(date, actualUntil) > 0;
    return {
      date,
      plannedPct: num(r.plannedPct),
      actualPct: future ? null : num(r.actualPct),
      variancePp: future ? null : num(r.progressVariancePp),
    };
  });
}

export interface PeriodDelta {
  date: ISODate;
  plannedDeltaPp: number | null;
  actualDeltaPp: number | null;
}
/** Progress made inside each period, in percentage points of the project (difference of cumulative points). */
export function periodDeltas(series: readonly SeriesPoint[]): PeriodDelta[] {
  const out: PeriodDelta[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const d = (x: number | null, y: number | null) => (x === null || y === null ? null : Number((y - x).toFixed(1)));
    out.push({ date: b.date, plannedDeltaPp: d(a.plannedPct, b.plannedPct), actualDeltaPp: d(a.actualPct, b.actualPct) });
  }
  return out;
}

export interface ActivityVarianceRow {
  activityId: string;
  name: string;
  unit: string;
  plannedPct: number | null;
  actualPct: number | null;
  variancePp: number | null;
  shortfallPct: number | null;
  scheduleVarianceDays: number | null;
  forecastFinish: string | null;
  forecastStatus: "completed" | "forecast" | "insufficient_data";
  forecastConfidence: string | null;
  estimatedDelayDays: number | null;
  totalFloatWorkingDays: number | null;
  critical: boolean;
  flags: string[];
}

export function activityVariance(
  input: Pick<ProjectInput, "activities">,
  metrics: ProjectMetrics,
): ActivityVarianceRow[] {
  const rows = input.activities.map((a): ActivityVarianceRow => {
    const p = metrics.progress[a.id];
    const f = metrics.forecast.activities[a.id];
    const c = metrics.cpm.activities[a.id];
    return {
      activityId: a.id,
      name: a.name,
      unit: a.unit,
      plannedPct: num(p.plannedPct),
      actualPct: num(p.actualPct),
      variancePp: num(p.progressVariancePp),
      shortfallPct: num(p.shortfallPct),
      scheduleVarianceDays: num(p.scheduleVarianceDays, 1),
      forecastFinish: f.forecastFinish,
      forecastStatus: f.status,
      forecastConfidence: f.confidence,
      estimatedDelayDays: f.estimatedDelayDays,
      totalFloatWorkingDays: c ? c.totalFloat : null,
      critical: c?.critical ?? false,
      flags: p.flags,
    };
  });
  // most-behind first; unknowns last
  return rows.sort((a, b) => (a.variancePp ?? Infinity) - (b.variancePp ?? Infinity));
}

// ---------------------------------------------------------------------------------------------
// Delay reasons
// ---------------------------------------------------------------------------------------------
export interface DelayEventLike {
  category: string;
  start_date: ISODate;
  end_date: ISODate;
  duration_working_days: number | string | null;
  review_status: "unreviewed" | "confirmed" | "dismissed";
}
export interface DelayCategoryRow {
  category: string;
  events: number;
  confirmedEvents: number;
  unreviewedEvents: number;
  /** Sum of event durations. Overlapping events are NOT de-duplicated here (see distinctDelayedWorkingDays). */
  workingDays: number;
  confirmedWorkingDays: number;
  sharePct: number;
}
export interface DelayDistribution {
  rows: DelayCategoryRow[];
  /** Working days on which at least one non-dismissed delay event was active (overlaps counted once). */
  distinctDelayedWorkingDays: number;
  dismissedExcluded: number;
  note: string;
}

export function delayDistribution(events: readonly DelayEventLike[], calendar: WorkCalendar): DelayDistribution {
  const active = events.filter((e) => e.review_status !== "dismissed");
  const dur = (e: DelayEventLike) =>
    e.duration_working_days !== null && e.duration_working_days !== undefined
      ? Number(e.duration_working_days)
      : countWorkingDays(calendar, e.start_date, e.end_date);

  const byCat = new Map<string, DelayCategoryRow>();
  let total = 0;
  for (const e of active) {
    const row = byCat.get(e.category) ?? {
      category: e.category, events: 0, confirmedEvents: 0, unreviewedEvents: 0, workingDays: 0, confirmedWorkingDays: 0, sharePct: 0,
    };
    const d = dur(e);
    row.events++;
    row.workingDays += d;
    if (e.review_status === "confirmed") {
      row.confirmedEvents++;
      row.confirmedWorkingDays += d;
    } else row.unreviewedEvents++;
    total += d;
    byCat.set(e.category, row);
  }
  const rows = [...byCat.values()]
    .map((r) => ({ ...r, sharePct: total === 0 ? 0 : Number(((r.workingDays / total) * 100).toFixed(1)) }))
    .sort((a, b) => b.workingDays - a.workingDays);

  // union of working days across all active events
  const days = new Set<number>();
  for (const e of active) {
    const s = toEpochDay(e.start_date);
    const t = toEpochDay(e.end_date);
    for (let d = s; d <= t; d++) {
      if (countWorkingDays(calendar, fromEpochDay(d), fromEpochDay(d)) === 1) days.add(d);
    }
  }
  return {
    rows,
    distinctDelayedWorkingDays: days.size,
    dismissedExcluded: events.length - active.length,
    note:
      "Logged delay events describe what was recorded on site. A category's share is not proof that it caused " +
      "the schedule slip, and overlapping or concurrent events are not apportioned.",
  };
}

// ---------------------------------------------------------------------------------------------
// Resource utilisation
// ---------------------------------------------------------------------------------------------
export function periodKey(date: ISODate, g: Granularity): string {
  if (g === "daily") return date;
  if (g === "monthly") return date.slice(0, 7);
  const e = toEpochDay(date);
  const back = (weekday(date) + 6) % 7; // days since Monday
  return fromEpochDay(e - back);
}

export interface WorkforceDay {
  date: ISODate;
  planned: number | string | null;
  actual: number | string | null;
}
export interface WorkforcePeriod {
  period: string;
  plannedPersonDays: number;
  actualPersonDays: number;
  variancePct: number | null;
  comparedDays: number;
  unreportedDays: number;
}
/** Only days with BOTH a planned and an actual headcount are compared; missing actuals are not treated as zero. */
export function workforceByPeriod(days: readonly WorkforceDay[], g: Granularity): WorkforcePeriod[] {
  const m = new Map<string, { p: Dec; a: Dec; n: number; u: number }>();
  for (const d of days) {
    const k = periodKey(d.date, g);
    const cur = m.get(k) ?? { p: Dec.ZERO, a: Dec.ZERO, n: 0, u: 0 };
    if (d.planned === null || d.actual === null || d.planned === undefined || d.actual === undefined) cur.u++;
    else {
      cur.p = cur.p.add(Dec.of(String(d.planned)));
      cur.a = cur.a.add(Dec.of(String(d.actual)));
      cur.n++;
    }
    m.set(k, cur);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      period,
      plannedPersonDays: Number(v.p.toFixed(1)),
      actualPersonDays: Number(v.a.toFixed(1)),
      variancePct: v.p.isZero() ? null : Number(v.a.sub(v.p).div(v.p).mul(100).toFixed(1)),
      comparedDays: v.n,
      unreportedDays: v.u,
    }));
}

export interface MachineDay {
  date: ISODate;
  plannedHours: number | string;
  operatingHours: number | string;
  downtimeHours: number | string;
}
export interface MachinePeriod {
  period: string;
  plannedHours: number;
  operatingHours: number;
  downtimeHours: number;
  utilizationPct: number | null;
  downtimePct: number | null;
}
export function machineByPeriod(days: readonly MachineDay[], g: Granularity): MachinePeriod[] {
  const m = new Map<string, { p: Dec; o: Dec; d: Dec }>();
  for (const x of days) {
    const k = periodKey(x.date, g);
    const cur = m.get(k) ?? { p: Dec.ZERO, o: Dec.ZERO, d: Dec.ZERO };
    cur.p = cur.p.add(Dec.of(String(x.plannedHours)));
    cur.o = cur.o.add(Dec.of(String(x.operatingHours)));
    cur.d = cur.d.add(Dec.of(String(x.downtimeHours)));
    m.set(k, cur);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({
      period,
      plannedHours: Number(v.p.toFixed(1)),
      operatingHours: Number(v.o.toFixed(1)),
      downtimeHours: Number(v.d.toFixed(1)),
      utilizationPct: v.p.isZero() ? null : Number(v.o.div(v.p).mul(100).toFixed(1)),
      downtimePct: v.o.add(v.d).isZero() ? null : Number(v.d.div(v.o.add(v.d)).mul(100).toFixed(1)),
    }));
}

export function addCalendarDays(date: ISODate, n: number): ISODate {
  return addDays(date, n);
}

// ---------------------------------------------------------------------------------------------
// Portfolio delay trend
// ---------------------------------------------------------------------------------------------
export interface TrendEvent {
  project_id: string;
  start_date: ISODate;
  end_date: ISODate;
  duration_working_days: number | string | null;
  review_status: "unreviewed" | "confirmed" | "dismissed";
}
export interface TrendPoint { month: string; workingDays: number; confirmedWorkingDays: number; events: number }

/**
 * Working days lost per calendar month (by the event's START month), across projects. Dismissed events are excluded.
 * When an event has no recorded duration its working days are counted on its own project's calendar.
 * Overlapping events are summed (this is a trend of reported delay, not a count of distinct delayed days).
 */
export function delayTrendByMonth(events: readonly TrendEvent[], calendarFor: (projectId: string) => WorkCalendar): TrendPoint[] {
  const m = new Map<string, TrendPoint>();
  for (const e of events) {
    if (e.review_status === "dismissed") continue;
    const days = e.duration_working_days !== null && e.duration_working_days !== undefined
      ? Number(e.duration_working_days)
      : countWorkingDays(calendarFor(e.project_id), e.start_date, e.end_date);
    const key = e.start_date.slice(0, 7);
    const cur = m.get(key) ?? { month: key, workingDays: 0, confirmedWorkingDays: 0, events: 0 };
    cur.workingDays += days;
    if (e.review_status === "confirmed") cur.confirmedWorkingDays += days;
    cur.events++;
    m.set(key, cur);
  }
  return [...m.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((p) => ({ ...p, workingDays: Number(p.workingDays.toFixed(1)), confirmedWorkingDays: Number(p.confirmedWorkingDays.toFixed(1)) }));
}
