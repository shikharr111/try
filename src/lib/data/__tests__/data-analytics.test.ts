import { test } from "node:test";
import assert from "node:assert/strict";
import { MON_FRI, computeProjectMetrics } from "../../calc";
import { buildProjectInput, decimalString } from "../mappers";
import {
  activityVariance,
  delayDistribution,
  machineByPeriod,
  periodDeltas,
  periodKey,
  progressSeries,
  sampleDates,
  workforceByPeriod,
} from "../../analytics/analytics";
import { canCreateProject, projectAccess, reportActions } from "../../permissions";

test("decimalString: exact for ordinary numerics, refuses lossy values", () => {
  assert.equal(decimalString(1800), "1800");
  assert.equal(decimalString(0.1), "0.1");
  assert.equal(decimalString("12.3400"), "12.3400");
  assert.throws(() => decimalString(1e21), /exactly/);
  assert.throws(() => decimalString(1234567890.123456), /15 significant/);
  assert.throws(() => decimalString(null), /missing/);
});

const project = { id: "p", working_weekdays: [1, 2, 3, 4, 5] };
const baseline = [
  { activity_id: "exc", code: "EXC", name: "Excavation", unit: "m3", weight: null, planned_start: "2026-10-05", planned_finish: "2026-10-16", total_qty: 1000 },
  { activity_id: "fnd", code: "FND", name: "Foundation", unit: "m3", weight: null, planned_start: "2026-10-19", planned_finish: "2026-10-30", total_qty: 500 },
];
const deps = [{ predecessor_id: "exc", successor_id: "fnd", lag_working_days: 0 }];
const entries = [80, 90, 100, 70, 60].map((q, i) => ({
  activity_id: "exc", report_date: `2026-10-0${5 + i}`, actual_qty: q, unit: "m3",
}));

test("mapper: DB-shaped rows reproduce the hand-verified engine result", () => {
  const input = buildProjectInput({ project, holidays: [], baseline, dailyPlans: [], dependencies: deps, entries, cutoff: "2026-10-09" });
  const m = computeProjectMetrics(input);
  assert.equal(m.plannedPct?.toString(), "25");
  assert.equal(m.actualPct?.toString(), "20");
  assert.equal(m.forecast.activities.exc.forecastFinish, "2026-10-21");
});

test("mapper: rows for activities outside the baseline are ignored; holidays reach the calendar", () => {
  const input = buildProjectInput({
    project, holidays: [{ holiday_date: "2026-10-07" }], baseline,
    dailyPlans: [], dependencies: [...deps, { predecessor_id: "ghost", successor_id: "fnd", lag_working_days: 0 }],
    entries: [...entries, { activity_id: "ghost", report_date: "2026-10-05", actual_qty: 5, unit: "m3" }], cutoff: "2026-10-09",
  });
  assert.equal(input.dependencies.length, 1);
  assert.equal(input.entries.length, 5);
  assert.deepEqual(input.calendar.holidays, ["2026-10-07"]);
});

test("mapper: custom distribution uses daily plan; linear ignores stray plan rows", () => {
  const custom = [{ ...baseline[0], distribution: "custom", planned_finish: "2026-10-07" }];
  const plans = [
    { activity_id: "exc", plan_date: "2026-10-05", planned_qty: 400 },
    { activity_id: "exc", plan_date: "2026-10-06", planned_qty: 300 },
    { activity_id: "exc", plan_date: "2026-10-07", planned_qty: 300 },
  ];
  const a = buildProjectInput({ project, holidays: [], baseline: custom, dailyPlans: plans, dependencies: [], entries: [], cutoff: "2026-10-06" });
  assert.equal(a.activities[0].dailyPlan?.length, 3);
  const b = buildProjectInput({ project, holidays: [], baseline, dailyPlans: plans, dependencies: [], entries: [], cutoff: "2026-10-06" });
  assert.equal(b.activities[0].dailyPlan, undefined);
});

test("sampleDates: weekly ends on Sundays plus the final date; monthly on month ends", () => {
  const w = sampleDates("2026-10-01", "2026-10-20", "weekly");
  assert.deepEqual(w, ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-20"]);
  const m = sampleDates("2026-09-15", "2026-11-10", "monthly");
  assert.deepEqual(m, ["2026-09-30", "2026-10-31", "2026-11-10"]);
  assert.equal(sampleDates("2026-10-01", "2026-10-03", "daily").length, 3);
  assert.deepEqual(sampleDates("2026-10-05", "2026-10-01", "daily"), []);
});

test("progressSeries: end point equals the dashboard KPI; future dates have no actuals", () => {
  const input = buildProjectInput({ project, holidays: [], baseline, dailyPlans: [], dependencies: deps, entries, cutoff: "2026-10-09" });
  const { cutoff: _c, ...rest } = input;
  const s = progressSeries(rest, ["2026-10-05", "2026-10-09", "2026-10-16"], "2026-10-09");
  const kpi = computeProjectMetrics(input);
  assert.equal(s[1].plannedPct, Number(kpi.plannedPct!.toFixed(1)));
  assert.equal(s[1].actualPct, Number(kpi.actualPct!.toFixed(1)));
  assert.equal(s[1].variancePp, -5);
  assert.equal(s[2].actualPct, null);
  assert.equal(s[2].plannedPct, 50); // exc complete (100%) + fnd not started, equal weights
  const d = periodDeltas(s);
  assert.equal(d[0].actualDeltaPp, Number((s[1].actualPct! - s[0].actualPct!).toFixed(1)));
  assert.equal(d[1].actualDeltaPp, null);
});

test("activityVariance: most-behind first, includes forecast and float", () => {
  const input = buildProjectInput({ project, holidays: [], baseline, dailyPlans: [], dependencies: deps, entries, cutoff: "2026-10-09" });
  const rows = activityVariance(input, computeProjectMetrics(input));
  assert.equal(rows[0].name.startsWith("EXC"), true);
  assert.equal(rows[0].variancePp, -10);
  assert.equal(rows[0].shortfallPct, 20);
  assert.equal(rows[0].forecastFinish, "2026-10-21");
  assert.equal(rows[0].critical, true);
  assert.equal(rows[1].forecastStatus, "forecast");
});

test("delayDistribution: dismissed excluded, overlaps counted once in the distinct total, no blame wording", () => {
  const d = delayDistribution(
    [
      { category: "weather", start_date: "2026-10-05", end_date: "2026-10-06", duration_working_days: 2, review_status: "confirmed" },
      { category: "equipment_breakdown", start_date: "2026-10-06", end_date: "2026-10-07", duration_working_days: 2, review_status: "unreviewed" },
      { category: "labor_shortage", start_date: "2026-10-12", end_date: "2026-10-12", duration_working_days: null, review_status: "dismissed" },
    ],
    MON_FRI,
  );
  assert.equal(d.dismissedExcluded, 1);
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows.reduce((s, r) => s + r.workingDays, 0), 4);
  assert.equal(d.distinctDelayedWorkingDays, 3); // 5th, 6th (overlap), 7th
  assert.equal(d.rows[0].sharePct, 50);
  assert.match(d.note, /not proof/);
});

test("delayDistribution: missing duration falls back to working days between the dates", () => {
  const d = delayDistribution(
    [{ category: "weather", start_date: "2026-10-09", end_date: "2026-10-12", duration_working_days: null, review_status: "confirmed" }],
    MON_FRI,
  );
  assert.equal(d.rows[0].workingDays, 2); // Fri + Mon
});

test("periodKey: weeks start on Monday", () => {
  assert.equal(periodKey("2026-10-23", "weekly"), "2026-10-19");
  assert.equal(periodKey("2026-10-25", "weekly"), "2026-10-19"); // Sunday belongs to the week that began Monday
  assert.equal(periodKey("2026-10-26", "weekly"), "2026-10-26");
  assert.equal(periodKey("2026-10-23", "monthly"), "2026-10");
});

test("workforceByPeriod: unreported days excluded from the comparison, not counted as zero", () => {
  const r = workforceByPeriod(
    [
      { date: "2026-10-19", planned: 10, actual: 8 },
      { date: "2026-10-20", planned: 10, actual: null },
      { date: "2026-10-21", planned: 10, actual: 12 },
    ],
    "weekly",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].comparedDays, 2);
  assert.equal(r[0].unreportedDays, 1);
  assert.equal(r[0].plannedPersonDays, 20);
  assert.equal(r[0].actualPersonDays, 20);
  assert.equal(r[0].variancePct, 0);
});

test("machineByPeriod: utilisation and downtime shares", () => {
  const r = machineByPeriod(
    [
      { date: "2026-10-19", plannedHours: 16, operatingHours: 12, downtimeHours: 4 },
      { date: "2026-10-20", plannedHours: 16, operatingHours: 12, downtimeHours: 4 },
    ],
    "weekly",
  );
  assert.equal(r[0].utilizationPct, 75);
  assert.equal(r[0].downtimePct, 25);
});

test("permissions mirror RLS: roles and report workflow", () => {
  const admin = projectAccess("org_admin", null);
  assert.deepEqual([admin.read, admin.manage, admin.review], [true, true, true]);
  const eng = projectAccess("site_engineer", "site_engineer");
  assert.deepEqual([eng.read, eng.manage, eng.report, eng.review, eng.runAiAnalysis], [true, false, true, false, false]);
  const orgPmNotAssigned = projectAccess("project_manager", null);
  assert.equal(orgPmNotAssigned.read, false); // org role alone grants no project access
  const pm = projectAccess("project_manager", "project_manager");
  assert.equal(pm.manage && pm.review && pm.runAiAnalysis, true);
  assert.equal(canCreateProject("site_engineer"), false);
  assert.equal(canCreateProject("project_manager"), true);

  assert.equal(reportActions({ status: "submitted", isReporter: true, access: eng }).approve, false);
  assert.equal(reportActions({ status: "submitted", isReporter: false, access: pm }).approve, true);
  assert.equal(reportActions({ status: "approved", isReporter: true, access: eng }).edit, false);
  assert.equal(reportActions({ status: "approved", isReporter: false, access: pm }).reject, true);
  assert.equal(reportActions({ status: "draft", isReporter: true, access: eng }).submit, true);
  assert.equal(reportActions({ status: "draft", isReporter: false, access: eng }).edit, false);
});
