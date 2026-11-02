import { test } from "node:test";
import assert from "node:assert/strict";
import { MON_FRI } from "../dates";
import { computeCpm, cpmDates, topologicalOrder } from "../cpm";
import { machineHours, workforceVariance } from "../resources";
import { CalcInputError, CycleError } from "../types";

const nodes = [
  { id: "A", durationWorkingDays: 3 },
  { id: "B", durationWorkingDays: 4 },
  { id: "C", durationWorkingDays: 2 },
  { id: "D", durationWorkingDays: 3 },
  { id: "E", durationWorkingDays: 2 },
];
const deps = [
  { predecessorId: "A", successorId: "B" },
  { predecessorId: "A", successorId: "C" },
  { predecessorId: "B", successorId: "D" },
  { predecessorId: "C", successorId: "D" },
  { predecessorId: "D", successorId: "E" },
];

test("CPM: textbook network, durations 3/4/2/3/2", () => {
  const r = computeCpm(nodes, deps);
  assert.equal(r.projectDurationWorkingDays, 12);
  assert.deepEqual(r.criticalActivityIds, ["A", "B", "D", "E"]);
  assert.equal(r.activities.C.totalFloat, 2);
  assert.equal(r.activities.C.freeFloat, 2);
  assert.equal(r.activities.C.critical, false);
  assert.equal(r.activities.B.earlyStart, 3);
  assert.equal(r.activities.D.earlyStart, 7);
  assert.equal(r.activities.E.earlyFinish, 12);
  assert.equal(r.activities.C.lateStart, 5);
});

test("CPM: lag lengthens the path; negative lag (lead) shortens it", () => {
  const lagged = deps.map((d) => (d.predecessorId === "D" ? { ...d, lagWorkingDays: 1 } : d));
  assert.equal(computeCpm(nodes, lagged).projectDurationWorkingDays, 13);
  const lead = deps.map((d) => (d.predecessorId === "D" ? { ...d, lagWorkingDays: -1 } : d));
  assert.equal(computeCpm(nodes, lead).projectDurationWorkingDays, 11);
});

test("CPM: independent chains - the shorter one carries float", () => {
  const r = computeCpm(
    [
      { id: "long", durationWorkingDays: 5 },
      { id: "short", durationWorkingDays: 3 },
    ],
    [],
  );
  assert.equal(r.projectDurationWorkingDays, 5);
  assert.equal(r.activities.short.totalFloat, 2);
  assert.deepEqual(r.criticalActivityIds, ["long"]);
});

test("CPM: milestones (zero duration) are supported", () => {
  const r = computeCpm(
    [
      { id: "work", durationWorkingDays: 4 },
      { id: "milestone", durationWorkingDays: 0 },
    ],
    [{ predecessorId: "work", successorId: "milestone" }],
  );
  assert.equal(r.activities.milestone.earlyStart, 4);
  assert.equal(r.projectDurationWorkingDays, 4);
  assert.ok(r.activities.milestone.critical);
});

test("CPM: cycles are detected and reported", () => {
  const ids = ["A", "B", "C"];
  const cyc = [
    { predecessorId: "A", successorId: "B" },
    { predecessorId: "B", successorId: "C" },
    { predecessorId: "C", successorId: "A" },
  ];
  assert.throws(() => topologicalOrder(ids, cyc), CycleError);
});

test("CPM: unknown ids, self-dependency and unimplemented types are rejected, not faked", () => {
  assert.throws(() => computeCpm(nodes, [{ predecessorId: "Z", successorId: "A" }]), CalcInputError);
  assert.throws(() => computeCpm(nodes, [{ predecessorId: "A", successorId: "A" }]), CalcInputError);
  assert.throws(
    () => computeCpm(nodes, [{ predecessorId: "A", successorId: "B", type: "SS" as unknown as "FS" }]),
    /not implemented/,
  );
  assert.throws(() => computeCpm([{ id: "A", durationWorkingDays: -1 }], []), CalcInputError);
  assert.throws(() => computeCpm([nodes[0], nodes[0]], []), CalcInputError);
});

test("CPM: offsets map to calendar dates on a Mon-Fri calendar", () => {
  const r = computeCpm(nodes, deps);
  const a = cpmDates(r.activities.A, "2026-10-05", MON_FRI);
  assert.equal(a.earlyStart, "2026-10-05");
  assert.equal(a.earlyFinish, "2026-10-07");
  const b = cpmDates(r.activities.B, "2026-10-05", MON_FRI);
  assert.equal(b.earlyStart, "2026-10-08"); // offset 3 = Thursday
  assert.equal(b.earlyFinish, "2026-10-13"); // 4 working days: Thu, Fri, Mon, Tue
});

test("workforce variance: only days with both counts are compared; missing actuals are not zero", () => {
  const r = workforceVariance(
    [
      { date: "2026-10-05", plannedWorkers: "10", actualWorkers: "8" },
      { date: "2026-10-06", plannedWorkers: "10", actualWorkers: "12" },
      { date: "2026-10-07", plannedWorkers: "10", actualWorkers: null },
      { date: "2026-10-12", plannedWorkers: "10", actualWorkers: "1" }, // after cutoff
    ],
    "2026-10-09",
  );
  assert.equal(r.comparedDays, 2);
  assert.equal(r.unreportedDays, 1);
  assert.equal(r.plannedPersonDays.toString(), "20");
  assert.equal(r.actualPersonDays.toString(), "20");
  assert.equal(r.variancePersonDays.toString(), "0");
  assert.equal(r.variancePct?.toString(), "0");
});

test("workforce variance: shortage is -30% here; zero planned gives null percentage", () => {
  const r = workforceVariance(
    [
      { date: "2026-10-05", plannedWorkers: "10", actualWorkers: "6" },
      { date: "2026-10-06", plannedWorkers: "10", actualWorkers: "8" },
    ],
    "2026-10-09",
  );
  assert.equal(r.variancePersonDays.toString(), "-6");
  assert.equal(r.variancePct?.toString(), "-30");
  const z = workforceVariance([{ date: "2026-10-05", plannedWorkers: "0", actualWorkers: "3" }], "2026-10-09");
  assert.equal(z.variancePct, null);
});

test("machine hours: utilization 75%, downtime 25% of available; zero planned -> null", () => {
  const r = machineHours(
    [
      { date: "2026-10-05", machineType: "Excavator", plannedHours: "40", operatingHours: "30", downtimeHours: "10" },
      { date: "2026-10-06", machineType: "Excavator", plannedHours: "40", operatingHours: "30", downtimeHours: "10" },
    ],
    "2026-10-09",
  );
  assert.equal(r.plannedHours.toString(), "80");
  assert.equal(r.operatingHours.toString(), "60");
  assert.equal(r.varianceHours.toString(), "-20");
  assert.equal(r.utilizationPct?.toString(), "75");
  assert.equal(r.downtimePct?.toString(), "25");
  const z = machineHours(
    [{ date: "2026-10-05", machineType: "Crane", plannedHours: "0", operatingHours: "0", downtimeHours: "0" }],
    "2026-10-09",
  );
  assert.equal(z.utilizationPct, null);
  assert.equal(z.downtimePct, null);
});

test("resources: negative inputs are rejected", () => {
  assert.throws(
    () => workforceVariance([{ date: "2026-10-05", plannedWorkers: "-1", actualWorkers: "1" }], "2026-10-09"),
    CalcInputError,
  );
  assert.throws(
    () =>
      machineHours(
        [{ date: "2026-10-05", machineType: "X", plannedHours: "1", operatingHours: "-1", downtimeHours: "0" }],
        "2026-10-09",
      ),
    CalcInputError,
  );
});
