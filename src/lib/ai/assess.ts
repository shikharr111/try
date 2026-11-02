import type { RecommendedAction } from "./schema";
import type { MetricSnapshot } from "./snapshot";

/**
 * Deterministic feasibility checks for each proposed action against the data we actually hold:
 * working calendar, dependencies, and the workforce/equipment levels observed on this project.
 * Where data to judge is absent (e.g. size of the available labour pool) the result is "unknown", not "pass".
 */
export type CheckResult = "pass" | "warn" | "unknown";
export interface ActionCheck {
  check: "target" | "calendar" | "dependencies" | "workforce" | "machines";
  result: CheckResult;
  detail: string;
}
export interface AssessedAction extends RecommendedAction {
  feasibility_checks: ActionCheck[];
}

type SnapshotActivity = {
  forecast: { status: string };
  progress: { remaining_qty: string | null };
  schedule_logic: { predecessors: string[] };
};

export function assessActions(actions: readonly RecommendedAction[], snapshot: MetricSnapshot): AssessedAction[] {
  const activities = snapshot.activities as Record<string, SnapshotActivity>;
  const peak = snapshot.resources.observed_peak_workers_on_any_day;
  const maxByType = snapshot.resources.observed_max_machines_by_type;
  const weekdays = snapshot.project.working_weekdays;

  return actions.map((a) => {
    const checks: ActionCheck[] = [];
    const target = a.target_activity_code ? activities[a.target_activity_code] : undefined;

    if (a.target_activity_code && !target) {
      checks.push({ check: "target", result: "warn", detail: `Target activity "${a.target_activity_code}" is not part of the current baseline.` });
    } else if (target && Number(target.progress.remaining_qty ?? "0") === 0) {
      checks.push({ check: "target", result: "warn", detail: "Target activity has no remaining work, so this action cannot shorten it." });
    } else if (target) {
      checks.push({ check: "target", result: "pass", detail: "Target activity exists and has remaining work." });
    }

    const rr = a.resource_requirements;
    if (rr.works_on_non_working_days) {
      const off = [0, 1, 2, 3, 4, 5, 6].filter((d) => !weekdays.includes(d)).length;
      checks.push({
        check: "calendar", result: "warn",
        detail: `Relies on working non-working days (project calendar has ${off} non-working weekday(s) and ${snapshot.project.holidays.length} holiday(s)); needs approval and labour-law/site-permit confirmation.`,
      });
    } else checks.push({ check: "calendar", result: "pass", detail: "Fits the project working calendar." });

    if (rr.starts_before_predecessor_complete) {
      const preds = target?.schedule_logic.predecessors ?? [];
      const open = preds.filter((p) => Number(activities[p]?.progress.remaining_qty ?? "0") > 0);
      checks.push({
        check: "dependencies", result: "warn",
        detail: open.length > 0
          ? `Starts before predecessor(s) ${open.join(", ")} are complete: breaks finish-to-start logic and needs a baseline change approved by a manager.`
          : "Flagged as starting early, but no incomplete predecessors were found in the data.",
      });
    } else checks.push({ check: "dependencies", result: "pass", detail: "Respects the recorded finish-to-start dependencies." });

    if (rr.additional_workers !== null && rr.additional_workers > 0) {
      if (peak !== null && rr.additional_workers > peak) {
        checks.push({ check: "workforce", result: "warn", detail: `Adds ${rr.additional_workers} workers, more than the highest total headcount ever reported on a single day (${peak}). Availability is not recorded in the data.` });
      } else {
        checks.push({ check: "workforce", result: "unknown", detail: `Adds ${rr.additional_workers} workers. Availability of additional labour is not recorded in the data and must be confirmed.` });
      }
    }
    for (const m of rr.additional_machines.filter((x) => x.count > 0)) {
      const seen = Object.entries(maxByType).find(([t]) => t.toLowerCase() === m.type.toLowerCase());
      checks.push(
        seen
          ? { check: "machines", result: "unknown", detail: `Adds ${m.count} × ${m.type}; up to ${seen[1]} were used at once so far. Fleet availability is not recorded and must be confirmed.` }
          : { check: "machines", result: "warn", detail: `Adds ${m.count} × ${m.type}, a machine type with no record on this project. Availability and site suitability must be confirmed.` },
      );
    }
    return { ...a, feasibility_checks: checks };
  });
}
