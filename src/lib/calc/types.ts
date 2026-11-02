import type { ISODate, WorkCalendar } from "./dates";

export class CalcInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcInputError";
  }
}
export class UnitMismatchError extends CalcInputError {
  constructor(public activityId: string, expected: string, got: string) {
    super(`Unit mismatch on activity ${activityId}: expected "${expected}", got "${got}"`);
    this.name = "UnitMismatchError";
  }
}
export class CycleError extends CalcInputError {
  constructor(public ids: string[]) {
    super(`Dependency cycle involving: ${ids.join(", ")}`);
    this.name = "CycleError";
  }
}

/** Approved-baseline view of an activity. Quantities are decimal strings. */
export interface ActivityInput {
  id: string;
  name: string;
  unit: string;
  /** Total approved quantity */
  totalQty: string;
  plannedStart: ISODate;
  plannedFinish: ISODate;
  /**
   * Explicit per-day planned quantities. When omitted, the plan is spread
   * evenly over the activity's working days (linear distribution).
   */
  dailyPlan?: ReadonlyArray<{ date: ISODate; qty: string }>;
  /** Defaults to the project calendar */
  calendar?: WorkCalendar;
  /** Relative weight for project roll-up. Defaults to planned working days. */
  weight?: string;
}

/** One reported quantity for an activity on a date (submitted/approved reports). */
export interface ActualEntry {
  activityId: string;
  date: ISODate;
  qty: string;
  unit?: string;
}

export interface Dependency {
  predecessorId: string;
  successorId: string;
  /** Only finish-to-start is implemented. Other types are rejected, not faked. */
  type?: "FS";
  /** Working days between predecessor finish and successor start (may be negative = lead) */
  lagWorkingDays?: number;
}
