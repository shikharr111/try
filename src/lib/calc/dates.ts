/**
 * Calendar-date utilities. Dates are ISO `YYYY-MM-DD` strings treated as pure
 * calendar days (no time of day, no timezone), converted to integer epoch days
 * via UTC so that DST and server timezone can never shift a date.
 */

export type ISODate = string;

export interface WorkCalendar {
  /** 0 = Sunday ... 6 = Saturday */
  workingWeekdays: readonly number[];
  /** Non-working dates that would otherwise be working days */
  holidays: readonly ISODate[];
}

export const MON_FRI: WorkCalendar = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };
export const MON_SAT: WorkCalendar = { workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: [] };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MAX_SCAN_DAYS = 200_000;

export function toEpochDay(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new TypeError(`Invalid ISO date: "${date}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new TypeError(`Non-existent calendar date: "${date}"`);
  }
  return Math.round(ms / MS_PER_DAY);
}

export function fromEpochDay(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidISODate(date: string): boolean {
  try {
    toEpochDay(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(date) + n);
}

/** Calendar days from a to b (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function maxDate(dates: readonly ISODate[]): ISODate {
  if (dates.length === 0) throw new RangeError("maxDate of empty list");
  return dates.reduce((a, b) => (toEpochDay(b) > toEpochDay(a) ? b : a));
}

export function weekday(date: ISODate): number {
  // 1970-01-01 was a Thursday (4)
  return (((toEpochDay(date) + 4) % 7) + 7) % 7;
}

function validateCalendar(cal: WorkCalendar): void {
  if (cal.workingWeekdays.length === 0) {
    throw new RangeError("Calendar has no working weekdays");
  }
  for (const w of cal.workingWeekdays) {
    if (!Number.isInteger(w) || w < 0 || w > 6) throw new RangeError(`Invalid weekday: ${w}`);
  }
}

const holidayCache = new WeakMap<WorkCalendar, Set<number>>();
function holidaySet(cal: WorkCalendar): Set<number> {
  let s = holidayCache.get(cal);
  if (!s) {
    s = new Set(cal.holidays.map(toEpochDay));
    holidayCache.set(cal, s);
  }
  return s;
}

export function isWorkingDay(cal: WorkCalendar, date: ISODate): boolean {
  validateCalendar(cal);
  const e = toEpochDay(date);
  const wd = (((e + 4) % 7) + 7) % 7;
  return cal.workingWeekdays.includes(wd) && !holidaySet(cal).has(e);
}

/** Working days in [start, end] inclusive; 0 when end < start. */
export function countWorkingDays(cal: WorkCalendar, start: ISODate, end: ISODate): number {
  validateCalendar(cal);
  const s = toEpochDay(start);
  const e = toEpochDay(end);
  if (e < s) return 0;
  if (e - s > MAX_SCAN_DAYS) throw new RangeError("Date range too large");
  let n = 0;
  for (let d = s; d <= e; d++) {
    if (isWorkingDay(cal, fromEpochDay(d))) n++;
  }
  return n;
}

/** First working day on or after `date`. */
export function onOrAfterWorkingDay(cal: WorkCalendar, date: ISODate): ISODate {
  validateCalendar(cal);
  let d = toEpochDay(date);
  for (let i = 0; i < MAX_SCAN_DAYS; i++, d++) {
    if (isWorkingDay(cal, fromEpochDay(d))) return fromEpochDay(d);
  }
  throw new RangeError("No working day found (calendar excludes every day?)");
}

/** First working day strictly after `date`. */
export function nextWorkingDay(cal: WorkCalendar, date: ISODate): ISODate {
  return onOrAfterWorkingDay(cal, addDays(date, 1));
}

/**
 * The working day at zero-based index `k` counting from the first working day
 * on or after `start` (k = 0 returns that first working day).
 */
export function workingDayAt(cal: WorkCalendar, start: ISODate, k: number): ISODate {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("k must be a non-negative integer");
  let d = toEpochDay(onOrAfterWorkingDay(cal, start));
  let remaining = k;
  let guard = 0;
  while (remaining > 0) {
    d++;
    if (++guard > MAX_SCAN_DAYS) throw new RangeError("Date range too large");
    if (isWorkingDay(cal, fromEpochDay(d))) remaining--;
  }
  return fromEpochDay(d);
}

/**
 * Move `n` working days from `date` (date itself is not counted).
 * n > 0 forward, n < 0 backward, n = 0 returns the first working day on or after `date`.
 */
export function addWorkingDays(cal: WorkCalendar, date: ISODate, n: number): ISODate {
  if (!Number.isInteger(n)) throw new RangeError("n must be an integer");
  if (n === 0) return onOrAfterWorkingDay(cal, date);
  const step = n > 0 ? 1 : -1;
  let d = toEpochDay(date);
  let remaining = Math.abs(n);
  let guard = 0;
  while (remaining > 0) {
    d += step;
    if (++guard > MAX_SCAN_DAYS) throw new RangeError("Date range too large");
    if (isWorkingDay(cal, fromEpochDay(d))) remaining--;
  }
  return fromEpochDay(d);
}
