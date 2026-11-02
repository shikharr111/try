import { test } from "node:test";
import assert from "node:assert/strict";
import { MON_FRI } from "../dates";
import { computeProgress } from "../progress";
import { CalcInputError, UnitMismatchError, type ActivityInput, type ActualEntry } from "../types";

/**
 * Fixture: Excavation, 1000 m3, Mon 2026-10-05 .. Fri 2026-10-16 = 10 working days,
 * linear plan = 100 m3 per working day.
 */
const excavation: ActivityInput = {
  id: "exc",
  name: "Excavation",
  unit: "m3",
  totalQty: "1000",
  plannedStart: "2026-10-05",
  plannedFinish: "2026-10-16",
};

const week1: ActualEntry[] = [
  { activityId: "exc", date: "2026-10-05", qty: "80" },
  { activityId: "exc", date: "2026-10-06", qty: "90" },
  { activityId: "exc", date: "2026-10-07", qty: "100" },
  { activityId: "exc", date: "2026-10-08", qty: "70" },
  { activityId: "exc", date: "2026-10-09", qty: "60" },
]; // 400 m3

test("behind plan at mid-period: planned 50%, actual 40%, variance -10pp, shortfall 20%", () => {
  const r = computeProgress(excavation, week1, "2026-10-09", MON_FRI);
  assert.equal(r.plannedCumQty.toString(), "500");
  assert.equal(r.actualCumQty.toString(), "400");
  assert.equal(r.plannedPct?.toString(), "50");
  assert.equal(r.actualPct?.toString(), "40");
  assert.equal(r.progressVariancePp?.toString(), "-10");
  assert.equal(r.shortfallPct?.toString(), "20"); // (500-400)/500*100
  assert.equal(r.remainingQty.toString(), "600");
  // earned schedule: 400 m3 = 4 plan-days, 5 days elapsed -> 1 working day behind
  assert.equal(r.scheduleVarianceDays?.toString(), "-1");
  assert.ok(r.flags.includes("PARTIAL_PERIOD"));
  assert.ok(!r.flags.includes("AHEAD_OF_SCHEDULE"));
  assert.ok(!r.flags.includes("STALE_REPORTS"));
  assert.equal(r.lastReportDate, "2026-10-09");
  assert.equal(r.reportedDays, 5);
});

test("ahead of schedule: positive variance, zero shortfall, positive schedule variance", () => {
  const ahead: ActualEntry[] = [{ activityId: "exc", date: "2026-10-09", qty: "600" }];
  const r = computeProgress(excavation, ahead, "2026-10-09", MON_FRI);
  assert.equal(r.progressVariancePp?.toString(), "10");
  assert.equal(r.shortfallPct?.toString(), "0");
  assert.equal(r.scheduleVarianceDays?.toString(), "1");
  assert.ok(r.flags.includes("AHEAD_OF_SCHEDULE"));
});

test("over-completion: uncapped 110%, capped 100%, remaining 0, completion date found", () => {
  const entries: ActualEntry[] = [
    { activityId: "exc", date: "2026-10-12", qty: "900" },
    { activityId: "exc", date: "2026-10-13", qty: "200" },
  ];
  const r = computeProgress(excavation, entries, "2026-10-16", MON_FRI);
  assert.equal(r.actualPct?.toString(), "110");
  assert.equal(r.actualPctCapped?.toString(), "100");
  assert.equal(r.overCompletedQty.toString(), "100");
  assert.equal(r.remainingQty.toString(), "0");
  assert.equal(r.shortfallPct?.toString(), "0");
  assert.equal(r.completionDate, "2026-10-13");
  assert.ok(r.flags.includes("OVER_COMPLETED"));
});

test("zero total quantity: percentages are null (no division by zero), flagged", () => {
  const zero: ActivityInput = { ...excavation, totalQty: "0" };
  const r = computeProgress(zero, week1, "2026-10-09", MON_FRI);
  assert.equal(r.plannedPct, null);
  assert.equal(r.actualPct, null);
  assert.equal(r.progressVariancePp, null);
  assert.equal(r.scheduleVarianceDays, null);
  assert.ok(r.flags.includes("ZERO_TOTAL_QTY"));
});

test("missing reports: actual 0, 100% shortfall, NO_REPORTS flag", () => {
  const r = computeProgress(excavation, [], "2026-10-09", MON_FRI);
  assert.equal(r.actualCumQty.toString(), "0");
  assert.equal(r.shortfallPct?.toString(), "100");
  assert.equal(r.lastReportDate, null);
  assert.ok(r.flags.includes("NO_REPORTS"));
});

test("before planned start: planned 0, shortfall undefined (null), NOT_YET_PLANNED", () => {
  const r = computeProgress(excavation, [], "2026-10-02", MON_FRI);
  assert.equal(r.plannedCumQty.toString(), "0");
  assert.equal(r.shortfallPct, null);
  assert.equal(r.scheduleVarianceDays?.toString(), "0");
  assert.ok(r.flags.includes("NOT_YET_PLANNED"));
  assert.ok(!r.flags.includes("NO_REPORTS"));
});

test("stale reports: last report older than 3 working days on an incomplete activity", () => {
  const entries: ActualEntry[] = [{ activityId: "exc", date: "2026-10-05", qty: "80" }];
  const r = computeProgress(excavation, entries, "2026-10-09", MON_FRI);
  assert.ok(r.flags.includes("STALE_REPORTS"));
  assert.ok(!r.flags.includes("NO_REPORTS"));
});

test("entries dated after the cutoff are ignored (same cutoff for planned and actual)", () => {
  const entries = [...week1, { activityId: "exc", date: "2026-10-12", qty: "999" }];
  const r = computeProgress(excavation, entries, "2026-10-09", MON_FRI);
  assert.equal(r.actualCumQty.toString(), "400");
});

test("other activities' entries are not counted", () => {
  const entries = [...week1, { activityId: "other", date: "2026-10-09", qty: "999" }];
  const r = computeProgress(excavation, entries, "2026-10-09", MON_FRI);
  assert.equal(r.actualCumQty.toString(), "400");
});

test("holiday inside the span shrinks the plan's working-day denominator", () => {
  const cal = { ...MON_FRI, holidays: ["2026-10-07"] }; // 9 working days in span
  const r = computeProgress(excavation, [], "2026-10-09", cal);
  // 4 working days done of 9 -> 1000 * 4/9
  assert.equal(r.plannedCumQty.toFixed(2), "444.44");
});

test("explicit front-loaded daily plan overrides the linear spread; earned schedule interpolates", () => {
  const a: ActivityInput = {
    ...excavation,
    plannedFinish: "2026-10-07",
    dailyPlan: [
      { date: "2026-10-05", qty: "400" },
      { date: "2026-10-06", qty: "300" },
      { date: "2026-10-07", qty: "300" },
    ],
  };
  const entries: ActualEntry[] = [{ activityId: "exc", date: "2026-10-06", qty: "500" }];
  const r = computeProgress(a, entries, "2026-10-06", MON_FRI);
  assert.equal(r.plannedCumQty.toString(), "700");
  // 500 reached 1/3 of the way through plan-day 2 -> ES = 1.333..., elapsed = 2
  assert.equal(r.scheduleVarianceDays?.toFixed(3), "-0.667");
});

test("units: aliases accepted, genuine mismatches rejected, never silently converted", () => {
  const ok: ActualEntry[] = [{ activityId: "exc", date: "2026-10-05", qty: "10", unit: "cum" }];
  assert.equal(computeProgress(excavation, ok, "2026-10-09", MON_FRI).actualCumQty.toString(), "10");
  const bad: ActualEntry[] = [{ activityId: "exc", date: "2026-10-05", qty: "10", unit: "kg" }];
  assert.throws(() => computeProgress(excavation, bad, "2026-10-09", MON_FRI), UnitMismatchError);
});

test("invalid input is rejected loudly: negative qty, bad dates, finish before start", () => {
  const neg: ActualEntry[] = [{ activityId: "exc", date: "2026-10-05", qty: "-5" }];
  assert.throws(() => computeProgress(excavation, neg, "2026-10-09", MON_FRI), CalcInputError);
  assert.throws(() => computeProgress(excavation, [], "2026-13-01", MON_FRI), CalcInputError);
  const backwards = { ...excavation, plannedFinish: "2026-10-01" };
  assert.throws(() => computeProgress(backwards, [], "2026-10-09", MON_FRI), CalcInputError);
});

test("multiple entries on one date are summed and flagged", () => {
  const entries: ActualEntry[] = [
    { activityId: "exc", date: "2026-10-05", qty: "40" },
    { activityId: "exc", date: "2026-10-05", qty: "35" },
  ];
  const r = computeProgress(excavation, entries, "2026-10-05", MON_FRI);
  assert.equal(r.actualCumQty.toString(), "75");
  assert.ok(r.flags.includes("MULTIPLE_ENTRIES_SAME_DAY"));
});

test("decimal-safe accumulation: many small quantities sum exactly", () => {
  const entries: ActualEntry[] = [];
  for (let i = 0; i < 10; i++) entries.push({ activityId: "exc", date: "2026-10-05", qty: "0.1" });
  const r = computeProgress(excavation, entries, "2026-10-05", MON_FRI);
  assert.equal(r.actualCumQty.toString(), "1");
});
