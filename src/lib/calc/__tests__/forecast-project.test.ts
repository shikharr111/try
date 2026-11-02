import { test } from "node:test";
import assert from "node:assert/strict";
import { Dec } from "../decimal";
import { MON_FRI } from "../dates";
import { forecastActivity, forecastProject } from "../forecast";
import { classifyHealth, computeProjectMetrics } from "../project";
import type { ActivityInput, ActualEntry } from "../types";

const excavation: ActivityInput = {
  id: "exc",
  name: "Excavation",
  unit: "m3",
  totalQty: "1000",
  plannedStart: "2026-10-05",
  plannedFinish: "2026-10-16",
};
const foundation: ActivityInput = {
  id: "fnd",
  name: "Foundation",
  unit: "m3",
  totalQty: "500",
  plannedStart: "2026-10-19",
  plannedFinish: "2026-10-30", // 10 working days -> 50 m3/day baseline
};
const deps = [{ predecessorId: "exc", successorId: "fnd" }];

const week1: ActualEntry[] = [
  { activityId: "exc", date: "2026-10-05", qty: "80" },
  { activityId: "exc", date: "2026-10-06", qty: "90" },
  { activityId: "exc", date: "2026-10-07", qty: "100" },
  { activityId: "exc", date: "2026-10-08", qty: "70" },
  { activityId: "exc", date: "2026-10-09", qty: "60" },
]; // 400 m3 in 5 days = 80 m3/day

test("activity forecast: 600 remaining at 80/day = 8 working days from Mon 12 Oct -> Wed 21 Oct", () => {
  const f = forecastActivity(excavation, week1, "2026-10-09", MON_FRI);
  assert.equal(f.status, "forecast");
  assert.equal(f.rateBasis, "recent_productivity");
  assert.equal(f.ratePerWorkingDay?.toString(), "80");
  assert.equal(f.forecastFinish, "2026-10-21");
  assert.equal(f.finishVarianceDays, 5);
  assert.equal(f.estimatedDelayDays, 5);
  assert.equal(f.confidence, "high");
  assert.equal(f.productivity?.reportedDays, 5);
});

test("activity forecast: too few reporting days -> no date is invented", () => {
  const two = week1.slice(0, 2);
  const f = forecastActivity(excavation, two, "2026-10-06", MON_FRI);
  assert.equal(f.status, "insufficient_data");
  assert.equal(f.forecastFinish, null);
  assert.equal(f.estimatedDelayDays, null);
  assert.ok(f.reasons.length > 0);
});

test("activity forecast: recent reports showing zero progress -> uncertain, not infinite", () => {
  const zeros: ActualEntry[] = ["2026-10-05", "2026-10-06", "2026-10-07"].map((date) => ({
    activityId: "exc",
    date,
    qty: "0",
  }));
  const f = forecastActivity(excavation, zeros, "2026-10-07", MON_FRI);
  assert.equal(f.status, "insufficient_data");
  assert.match(f.reasons[0], /zero progress/);
});

test("activity forecast: unstarted work has no forecast unless planned-rate fallback is allowed", () => {
  const no = forecastActivity(foundation, [], "2026-10-09", MON_FRI);
  assert.equal(no.status, "insufficient_data");
  const yes = forecastActivity(foundation, [], "2026-10-09", MON_FRI, {}, { allowPlannedRate: true });
  assert.equal(yes.status, "forecast");
  assert.equal(yes.rateBasis, "planned_rate");
  assert.equal(yes.confidence, "low");
  assert.equal(yes.forecastFinish, "2026-10-30"); // on its own plan
  assert.equal(yes.estimatedDelayDays, 0);
});

test("activity forecast: overdue-to-start activity with no reports is NOT given a planned-rate date", () => {
  const f = forecastActivity(excavation, [], "2026-10-09", MON_FRI, {}, { allowPlannedRate: true });
  assert.equal(f.status, "insufficient_data");
  assert.equal(f.forecastFinish, null);
  assert.match(f.reasons[0], /due to start/);
});

test("activity forecast: completed activity reports its actual completion date", () => {
  const done: ActualEntry[] = [
    { activityId: "exc", date: "2026-10-12", qty: "600" },
    { activityId: "exc", date: "2026-10-15", qty: "400" },
  ];
  const f = forecastActivity(excavation, done, "2026-10-16", MON_FRI);
  assert.equal(f.status, "completed");
  assert.equal(f.forecastFinish, "2026-10-15");
  assert.equal(f.finishVarianceDays, -1); // a day early
  assert.equal(f.estimatedDelayDays, 0);
});

test("activity forecast: sparse reporting lowers confidence and discloses the assumption", () => {
  const sparse: ActualEntry[] = [
    { activityId: "exc", date: "2026-10-05", qty: "80" },
    { activityId: "exc", date: "2026-10-07", qty: "80" },
    { activityId: "exc", date: "2026-10-09", qty: "80" },
  ];
  const f = forecastActivity(excavation, sparse, "2026-10-09", MON_FRI);
  assert.equal(f.status, "forecast");
  assert.equal(f.confidence, "medium"); // 3 days, 60% coverage
  assert.ok(f.assumptions.some((s) => /unreported days are not counted as zero/.test(s)));
});

test("project forecast: slip on excavation pushes the dependent foundation (FS logic)", () => {
  const pf = forecastProject([excavation, foundation], deps, week1, "2026-10-09", MON_FRI);
  assert.equal(pf.status, "forecast");
  assert.equal(pf.activities.exc.forecastFinish, "2026-10-21");
  // foundation may not start before Thu 22 Oct; 500 at 50/day = 10 working days -> Wed 4 Nov
  assert.equal(pf.activities.fnd.forecastFinish, "2026-11-04");
  assert.equal(pf.plannedFinish, "2026-10-30");
  assert.equal(pf.forecastFinish, "2026-11-04");
  assert.equal(pf.estimatedDelayDays, 5);
});

test("project forecast: uncertainty propagates to successors and the project date is withheld", () => {
  const pf = forecastProject([excavation, foundation], deps, [], "2026-10-09", MON_FRI);
  assert.equal(pf.status, "uncertain");
  assert.equal(pf.forecastFinish, null);
  assert.equal(pf.estimatedDelayDays, null);
  assert.deepEqual(pf.uncertainActivityIds, ["exc", "fnd"]);
  assert.match(pf.activities.fnd.reasons[0], /Predecessor forecast is uncertain/);
});

test("project metrics: weighted roll-up, forecast and health agree", () => {
  const m = computeProjectMetrics({
    activities: [excavation, foundation],
    dependencies: deps,
    entries: week1,
    cutoff: "2026-10-09",
    calendar: MON_FRI,
  });
  // equal weights (10 working days each): planned (50+0)/2, actual (40+0)/2
  assert.equal(m.plannedPct?.toString(), "25");
  assert.equal(m.actualPct?.toString(), "20");
  assert.equal(m.progressVariancePp?.toString(), "-5");
  assert.equal(m.forecast.estimatedDelayDays, 5);
  assert.equal(m.health.status, "at_risk");
  assert.deepEqual(m.cpm.criticalActivityIds, ["exc", "fnd"]);
  assert.equal(m.cpm.projectDurationWorkingDays, 20);
});

test("project metrics: snapshot serialises to plain JSON (Dec -> string)", () => {
  const m = computeProjectMetrics({
    activities: [excavation],
    dependencies: [],
    entries: week1,
    cutoff: "2026-10-09",
    calendar: MON_FRI,
  });
  const json = JSON.parse(JSON.stringify(m));
  assert.equal(json.plannedPct, "50");
  assert.equal(json.progress.exc.actualPct, "40");
  assert.equal(json.progress.exc.progressVariancePp, "-10");
});

test("health policy: thresholds and reasons", () => {
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(-12), forecastDelayDays: 0, forecastUncertain: false }).status, "delayed");
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(0), forecastDelayDays: 8, forecastUncertain: false }).status, "delayed");
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(-6), forecastDelayDays: 0, forecastUncertain: false }).status, "at_risk");
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(0), forecastDelayDays: 2, forecastUncertain: false }).status, "at_risk");
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(2), forecastDelayDays: 0, forecastUncertain: false }).status, "on_track");
  assert.equal(classifyHealth({ progressVariancePp: Dec.of(-1), forecastDelayDays: null, forecastUncertain: true }).status, "at_risk");
  assert.equal(classifyHealth({ progressVariancePp: null, forecastDelayDays: null, forecastUncertain: true }).status, "unknown");
});
