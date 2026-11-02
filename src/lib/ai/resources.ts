import { machineHours, workforceVariance, type ISODate } from "../calc";
import type { SnapshotResources } from "./snapshot";

/**
 * Aggregates raw workforce / equipment rows into the resource section of the AI snapshot, using the same
 * deterministic functions as the analytics pages. Pure: the caller fetches rows (with the user's RLS session).
 */
export interface WorkforceRow { report_date: ISODate; planned_workers: number | string; actual_workers: number | string }
export interface EquipmentRow {
  report_date: ISODate; machine_type: string; machine_count: number;
  planned_hours: number | string; operating_hours: number | string; downtime_hours: number | string;
}

const s = (v: number | string) => String(v);

export function buildResources(workforce: readonly WorkforceRow[], equipment: readonly EquipmentRow[], cutoff: ISODate): SnapshotResources {
  const wf = workforceVariance(
    workforce.map((w) => ({ date: w.report_date, plannedWorkers: s(w.planned_workers), actualWorkers: s(w.actual_workers) })),
    cutoff,
  );
  const mh = machineHours(
    equipment.map((e) => ({ date: e.report_date, machineType: e.machine_type, plannedHours: s(e.planned_hours), operatingHours: s(e.operating_hours), downtimeHours: s(e.downtime_hours) })),
    cutoff,
  );

  // peak total headcount on any single day (all trades and activities summed)
  const perDay = new Map<string, number>();
  for (const w of workforce) if (w.report_date <= cutoff) perDay.set(w.report_date, (perDay.get(w.report_date) ?? 0) + Number(w.actual_workers));
  const peak = perDay.size === 0 ? null : Math.max(...perDay.values());

  // most machines of each type seen working at once on a single day
  const byDayType = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const e of equipment) {
    if (e.report_date > cutoff) continue;
    const key = `${e.report_date}|${e.machine_type.toLowerCase()}`;
    byDayType.set(key, (byDayType.get(key) ?? 0) + e.machine_count);
    if (!nameOf.has(e.machine_type.toLowerCase())) nameOf.set(e.machine_type.toLowerCase(), e.machine_type); // keep first-seen spelling
  }
  const maxByType: Record<string, number> = {};
  for (const [key, n] of byDayType) {
    const type = nameOf.get(key.split("|")[1])!;
    maxByType[type] = Math.max(maxByType[type] ?? 0, n);
  }

  return {
    workforce: {
      plannedPersonDays: wf.plannedPersonDays.toFixed(2),
      actualPersonDays: wf.actualPersonDays.toFixed(2),
      variancePct: wf.variancePct?.toFixed(2) ?? null,
      comparedDays: wf.comparedDays,
      unreportedDays: wf.unreportedDays,
    },
    machines: {
      plannedHours: mh.plannedHours.toFixed(2),
      operatingHours: mh.operatingHours.toFixed(2),
      downtimeHours: mh.downtimeHours.toFixed(2),
      utilizationPct: mh.utilizationPct?.toFixed(2) ?? null,
      downtimePct: mh.downtimePct?.toFixed(2) ?? null,
    },
    observedPeakWorkersOnAnyDay: peak,
    observedMaxMachinesByType: maxByType,
  };
}
