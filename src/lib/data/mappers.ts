import type { ActivityInput, ActualEntry, Dependency, ProjectInput, WorkCalendar } from "../calc";

/**
 * Database rows -> calculation-engine inputs. Pure; no I/O.
 *
 * PostgREST returns `numeric` columns as JSON numbers. numeric(18,4) values with <= 15 significant
 * digits survive that round trip exactly via their shortest string form, which is what we use. Values
 * that would not (exponent notation / > 15 significant digits) are rejected rather than silently rounded.
 */

export type NumLike = number | string | null | undefined;

export function decimalString(v: NumLike, field = "value"): string {
  if (v === null || v === undefined || v === "") throw new TypeError(`${field}: missing numeric value`);
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) throw new TypeError(`${field}: not a finite number`);
  const s = String(v);
  if (/e/i.test(s)) throw new TypeError(`${field}: number ${s} cannot be represented exactly; fetch it as text`);
  if (s.replace(/[-.]/g, "").replace(/^0+/, "").length > 15) {
    throw new TypeError(`${field}: number ${s} has more than 15 significant digits; fetch it as text`);
  }
  return s;
}
const optDecimal = (v: NumLike, field: string): string | undefined =>
  v === null || v === undefined || v === "" ? undefined : decimalString(v, field);

export interface DbProject {
  id: string;
  working_weekdays: readonly number[];
}
export interface DbHoliday {
  holiday_date: string;
}
export interface DbBaselineRow {
  activity_id: string;
  code: string;
  name: string;
  unit: string;
  weight: NumLike;
  planned_start: string;
  planned_finish: string;
  total_qty: NumLike;
  distribution?: string;
}
export interface DbDailyPlan {
  activity_id: string;
  plan_date: string;
  planned_qty: NumLike;
}
export interface DbDependency {
  predecessor_id: string;
  successor_id: string;
  lag_working_days: number | null;
  dependency_type?: string;
}
export interface DbEntry {
  activity_id: string;
  report_date: string;
  actual_qty: NumLike;
  unit?: string | null;
}

export function buildCalendar(project: Pick<DbProject, "working_weekdays">, holidays: readonly DbHoliday[]): WorkCalendar {
  return {
    workingWeekdays: [...project.working_weekdays],
    holidays: holidays.map((h) => h.holiday_date),
  };
}

export function buildProjectInput(args: {
  project: DbProject;
  holidays: readonly DbHoliday[];
  baseline: readonly DbBaselineRow[];
  dailyPlans: readonly DbDailyPlan[];
  dependencies: readonly DbDependency[];
  entries: readonly DbEntry[];
  cutoff: string;
}): ProjectInput {
  const plansByActivity = new Map<string, { date: string; qty: string }[]>();
  for (const p of args.dailyPlans) {
    const list = plansByActivity.get(p.activity_id) ?? [];
    list.push({ date: p.plan_date, qty: decimalString(p.planned_qty, "daily plan qty") });
    plansByActivity.set(p.activity_id, list);
  }

  const activities: ActivityInput[] = args.baseline.map((b) => {
    const plan = b.distribution === "custom" ? plansByActivity.get(b.activity_id) : undefined;
    return {
      id: b.activity_id,
      name: `${b.code} ${b.name}`,
      unit: b.unit,
      totalQty: decimalString(b.total_qty, `${b.code} total quantity`),
      plannedStart: b.planned_start,
      plannedFinish: b.planned_finish,
      dailyPlan: plan && plan.length > 0 ? plan : undefined,
      weight: optDecimal(b.weight, `${b.code} weight`),
    };
  });
  const known = new Set(activities.map((a) => a.id));

  const dependencies: Dependency[] = args.dependencies
    .filter((d) => known.has(d.predecessor_id) && known.has(d.successor_id))
    .map((d) => ({
      predecessorId: d.predecessor_id,
      successorId: d.successor_id,
      type: "FS" as const,
      lagWorkingDays: d.lag_working_days ?? 0,
    }));

  const entries: ActualEntry[] = args.entries
    .filter((e) => known.has(e.activity_id))
    .map((e) => ({
      activityId: e.activity_id,
      date: e.report_date,
      qty: decimalString(e.actual_qty, "actual qty"),
      unit: e.unit ?? undefined,
    }));

  return {
    activities,
    dependencies,
    entries,
    cutoff: args.cutoff,
    calendar: buildCalendar(args.project, args.holidays),
  };
}
