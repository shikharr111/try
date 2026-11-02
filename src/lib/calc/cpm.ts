import { workingDayAt, countWorkingDays, type ISODate, type WorkCalendar } from "./dates";
import { CalcInputError, CycleError, type ActivityInput, type Dependency } from "./types";

/**
 * Critical Path Method on finish-to-start logic.
 *
 * All values are integer working-day offsets from project day 0.
 *   duration d (working days; 0 = milestone)
 *   ES(i)  = max over predecessors p of ( EF(p) + lag(p,i) ), or 0 with none
 *   EF(i)  = ES(i) + d(i)                     (EF is exclusive)
 *   LF(i)  = min over successors s of ( LS(s) - lag(i,s) ), or projectDuration with none
 *   LS(i)  = LF(i) - d(i)
 *   totalFloat(i) = LS(i) - ES(i)
 *   freeFloat(i)  = min over successors ( ES(s) - lag - EF(i) ), or projectDuration - EF(i)
 *   critical(i)   = totalFloat(i) === 0
 *
 * Float is derived from durations and logic only, not from imposed constraint
 * dates, and every activity is assumed to work on the project calendar.
 */

export interface CpmNode {
  id: string;
  durationWorkingDays: number;
}

export interface CpmActivityResult {
  id: string;
  durationWorkingDays: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
}

export interface CpmResult {
  projectDurationWorkingDays: number;
  activities: Record<string, CpmActivityResult>;
  /** Activities with zero total float, in topological order */
  criticalActivityIds: string[];
  topologicalOrder: string[];
}

export function validateDependencies(nodeIds: ReadonlySet<string>, deps: readonly Dependency[]): void {
  for (const d of deps) {
    if (d.type !== undefined && d.type !== "FS") {
      throw new CalcInputError(
        `Dependency type "${d.type}" is not implemented; only finish-to-start (FS) is supported`,
      );
    }
    if (!nodeIds.has(d.predecessorId)) throw new CalcInputError(`Unknown predecessor "${d.predecessorId}"`);
    if (!nodeIds.has(d.successorId)) throw new CalcInputError(`Unknown successor "${d.successorId}"`);
    if (d.predecessorId === d.successorId) throw new CalcInputError(`Activity "${d.predecessorId}" depends on itself`);
    if (d.lagWorkingDays !== undefined && !Number.isInteger(d.lagWorkingDays)) {
      throw new CalcInputError("Dependency lag must be a whole number of working days");
    }
  }
}

/** Kahn's algorithm. Throws CycleError listing the activities stuck in a cycle. */
export function topologicalOrder(ids: readonly string[], deps: readonly Dependency[]): string[] {
  validateDependencies(new Set(ids), deps);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const d of deps) {
    indegree.set(d.successorId, (indegree.get(d.successorId) ?? 0) + 1);
    out.get(d.predecessorId)!.push(d.successorId);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of out.get(id)!) {
      const n = (indegree.get(s) ?? 0) - 1;
      indegree.set(s, n);
      if (n === 0) queue.push(s);
    }
  }
  if (order.length !== ids.length) {
    throw new CycleError(ids.filter((id) => !order.includes(id)));
  }
  return order;
}

export function computeCpm(nodes: readonly CpmNode[], deps: readonly Dependency[]): CpmResult {
  const ids = nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new CalcInputError("Duplicate activity ids");
  for (const n of nodes) {
    if (!Number.isInteger(n.durationWorkingDays) || n.durationWorkingDays < 0) {
      throw new CalcInputError(`Activity "${n.id}": duration must be a non-negative whole number of working days`);
    }
  }
  const order = topologicalOrder(ids, deps);
  const dur = new Map(nodes.map((n) => [n.id, n.durationWorkingDays]));
  const preds = new Map<string, Dependency[]>(ids.map((id) => [id, []]));
  const succs = new Map<string, Dependency[]>(ids.map((id) => [id, []]));
  for (const d of deps) {
    preds.get(d.successorId)!.push(d);
    succs.get(d.predecessorId)!.push(d);
  }
  const lag = (d: Dependency) => d.lagWorkingDays ?? 0;

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    let start = 0;
    for (const d of preds.get(id)!) start = Math.max(start, ef.get(d.predecessorId)! + lag(d));
    es.set(id, start);
    ef.set(id, start + dur.get(id)!);
  }
  const projectDuration = ids.length === 0 ? 0 : Math.max(...ids.map((id) => ef.get(id)!));

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    let finish = projectDuration;
    for (const d of succs.get(id)!) finish = Math.min(finish, ls.get(d.successorId)! - lag(d));
    lf.set(id, finish);
    ls.set(id, finish - dur.get(id)!);
  }

  const activities: Record<string, CpmActivityResult> = {};
  for (const id of order) {
    let free = projectDuration - ef.get(id)!;
    for (const d of succs.get(id)!) free = Math.min(free, es.get(d.successorId)! - lag(d) - ef.get(id)!);
    const totalFloat = ls.get(id)! - es.get(id)!;
    activities[id] = {
      id,
      durationWorkingDays: dur.get(id)!,
      earlyStart: es.get(id)!,
      earlyFinish: ef.get(id)!,
      lateStart: ls.get(id)!,
      lateFinish: lf.get(id)!,
      totalFloat,
      freeFloat: free,
      critical: totalFloat === 0,
    };
  }
  return {
    projectDurationWorkingDays: projectDuration,
    activities,
    criticalActivityIds: order.filter((id) => activities[id].critical),
    topologicalOrder: order,
  };
}

/** Baseline duration in working days (inclusive of start and finish days). */
export function baselineDurationWorkingDays(a: ActivityInput, projectCal: WorkCalendar): number {
  return countWorkingDays(a.calendar ?? projectCal, a.plannedStart, a.plannedFinish);
}

/** Runs CPM using baseline durations of the given activities. */
export function computeCpmFromActivities(
  activities: readonly ActivityInput[],
  deps: readonly Dependency[],
  projectCal: WorkCalendar,
): CpmResult {
  return computeCpm(
    activities.map((a) => ({ id: a.id, durationWorkingDays: baselineDurationWorkingDays(a, projectCal) })),
    deps,
  );
}

export interface CpmDates {
  earlyStart: ISODate;
  earlyFinish: ISODate;
  lateStart: ISODate;
  lateFinish: ISODate;
}

/**
 * Maps working-day offsets to calendar dates (finish = last working day of work).
 * Zero-duration activities report the day at their offset for both start and finish.
 */
export function cpmDates(r: CpmActivityResult, projectStart: ISODate, cal: WorkCalendar): CpmDates {
  const day = (offset: number) => workingDayAt(cal, projectStart, Math.max(0, offset));
  const lastDay = (startOffset: number) => day(r.durationWorkingDays === 0 ? startOffset : startOffset + r.durationWorkingDays - 1);
  return {
    earlyStart: day(r.earlyStart),
    earlyFinish: lastDay(r.earlyStart),
    lateStart: day(r.lateStart),
    lateFinish: lastDay(r.lateStart),
  };
}
