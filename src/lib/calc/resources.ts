import { Dec, pct } from "./decimal";
import { compareDates, isValidISODate, type ISODate } from "./dates";
import { CalcInputError } from "./types";

/**
 * Resource comparisons are INFORMATION about inputs, not proof of delay.
 * A workforce shortfall can coincide with on-schedule progress (higher
 * productivity, front-loaded work) and vice versa. Nothing here feeds the
 * schedule-delay figures.
 */

export interface WorkforceRecord {
  date: ISODate;
  plannedWorkers: string;
  /** null/undefined = no actual count reported for that day */
  actualWorkers?: string | null;
}

export interface WorkforceVariance {
  /** Days where both planned and actual counts exist (the only days compared) */
  comparedDays: number;
  /** Days with a planned count but no reported actual count: excluded, not treated as zero */
  unreportedDays: number;
  plannedPersonDays: Dec;
  actualPersonDays: Dec;
  /** actual - planned (negative = fewer workers than planned) */
  variancePersonDays: Dec;
  /** variance / planned * 100; null when planned is zero */
  variancePct: Dec | null;
}

export function workforceVariance(records: readonly WorkforceRecord[], cutoff: ISODate): WorkforceVariance {
  let planned = Dec.ZERO;
  let actual = Dec.ZERO;
  let compared = 0;
  let unreported = 0;
  for (const r of records) {
    if (!isValidISODate(r.date)) throw new CalcInputError(`Invalid workforce date "${r.date}"`);
    if (compareDates(r.date, cutoff) > 0) continue;
    const p = Dec.of(r.plannedWorkers);
    if (p.isNegative()) throw new CalcInputError(`Negative planned workers on ${r.date}`);
    if (r.actualWorkers === null || r.actualWorkers === undefined) {
      unreported++;
      continue;
    }
    const a = Dec.of(r.actualWorkers);
    if (a.isNegative()) throw new CalcInputError(`Negative actual workers on ${r.date}`);
    planned = planned.add(p);
    actual = actual.add(a);
    compared++;
  }
  const variance = actual.sub(planned);
  return {
    comparedDays: compared,
    unreportedDays: unreported,
    plannedPersonDays: planned,
    actualPersonDays: actual,
    variancePersonDays: variance,
    variancePct: pct(variance, planned),
  };
}

export interface MachineRecord {
  date: ISODate;
  machineType: string;
  /** Planned machine-hours for the row (count x hours) */
  plannedHours: string;
  /** Operating machine-hours for the row */
  operatingHours: string;
  /** Downtime machine-hours for the row */
  downtimeHours: string;
}

export interface MachineHoursSummary {
  plannedHours: Dec;
  operatingHours: Dec;
  downtimeHours: Dec;
  /** operating - planned */
  varianceHours: Dec;
  /** operating / planned * 100; null when planned is zero */
  utilizationPct: Dec | null;
  /** downtime / (operating + downtime) * 100; null when both zero */
  downtimePct: Dec | null;
}

export function machineHours(records: readonly MachineRecord[], cutoff: ISODate): MachineHoursSummary {
  let planned = Dec.ZERO;
  let operating = Dec.ZERO;
  let downtime = Dec.ZERO;
  for (const r of records) {
    if (!isValidISODate(r.date)) throw new CalcInputError(`Invalid machine record date "${r.date}"`);
    if (compareDates(r.date, cutoff) > 0) continue;
    const p = Dec.of(r.plannedHours);
    const o = Dec.of(r.operatingHours);
    const d = Dec.of(r.downtimeHours);
    if (p.isNegative() || o.isNegative() || d.isNegative()) {
      throw new CalcInputError(`Negative machine hours for ${r.machineType} on ${r.date}`);
    }
    planned = planned.add(p);
    operating = operating.add(o);
    downtime = downtime.add(d);
  }
  return {
    plannedHours: planned,
    operatingHours: operating,
    downtimeHours: downtime,
    varianceHours: operating.sub(planned),
    utilizationPct: pct(operating, planned),
    downtimePct: pct(downtime, operating.add(downtime)),
  };
}
