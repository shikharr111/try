import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReportPayload } from "../payload";
import { buildResources } from "../../ai/resources";

const ids = new Set(["a1", "a2"]);
const good = () => ({
  header: { report_date: "2026-10-22", shift: "day", weather: "Clear", site_conditions: "", observations: "ok" },
  lines: [{ activity_id: "a1", actual_qty: "62.5", planned_qty: "70", planned_workers: "28", actual_workers: "24", material_available: "yes" }],
  workforce: [{ activity_id: "a1", trade: "Rebar crew", planned_workers: "28", actual_workers: "24", hours_worked: "8" }],
  equipment: [{ activity_id: "a1", machine_type: "Pump", machine_count: "1", planned_hours: "8", operating_hours: "7.5", downtime_hours: "0.5" }],
  delays: [{ activity_id: "a1", category: "weather", duration_working_days: "0.5", description: "Rain" }],
});

test("payload: a valid report passes and quantities stay decimal strings", () => {
  const r = parseReportPayload(good(), { activityIds: ids });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.lines[0].actual_qty, "62.5");
    assert.equal(r.value.lines[0].material_available, true);
    assert.equal(r.value.equipment[0].machine_count, 1);
    assert.equal(r.value.header.shift, "day");
    assert.equal(r.value.delays[0].category, "weather");
  }
});

test("payload: collects every error with its path", () => {
  const p = good() as Record<string, any>;
  p.header.report_date = "2026-02-30";
  p.lines[0].actual_qty = "-4";
  p.lines.push({ activity_id: "a1", actual_qty: "1" }); // duplicate activity
  p.lines.push({ activity_id: "zzz", actual_qty: "1" }); // not in project
  p.workforce[0].actual_workers = "many";
  p.equipment[0].operating_hours = "20";
  p.equipment[0].downtime_hours = "8";
  p.delays[0].category = "blame_the_crew";
  const r = parseReportPayload(p, { activityIds: ids });
  assert.equal(r.ok, false);
  if (!r.ok) {
    const all = r.errors.join("\n");
    assert.match(all, /header\.report_date/);
    assert.match(all, /lines\[0\]\.actual_qty: cannot be negative/);
    assert.match(all, /lines\[1\]\.activity_id: this activity appears twice/);
    assert.match(all, /lines\[2\]\.activity_id: is not an activity of this project/);
    assert.match(all, /workforce\[0\]\.actual_workers: must be a number/);
    assert.match(all, /exceeds 24 hours per machine/);
    assert.match(all, /delays\[0\]\.category/);
  }
});

test("payload: needs at least one line; actual quantity is required; junk input is rejected without throwing", () => {
  const noLines = { ...good(), lines: [] };
  const r1 = parseReportPayload(noLines, { activityIds: ids });
  assert.equal(r1.ok, false);
  const noQty = { ...good(), lines: [{ activity_id: "a1" }] };
  const r2 = parseReportPayload(noQty, { activityIds: ids });
  assert.equal(r2.ok, false);
  assert.equal(parseReportPayload(null, { activityIds: ids }).ok, false);
  assert.equal(parseReportPayload("x", { activityIds: ids }).ok, false);
  assert.equal(parseReportPayload({ header: 5, lines: "no" }, { activityIds: ids }).ok, false);
});

test("payload: duplicate trade / machine rows for the same activity are caught; limits enforced", () => {
  const p = good() as Record<string, any>;
  p.workforce.push({ ...p.workforce[0], trade: "REBAR CREW" });
  p.equipment.push({ ...p.equipment[0] });
  const r = parseReportPayload(p, { activityIds: ids });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.errors.join(" "), /trade is listed twice/);
    assert.match(r.errors.join(" "), /machine type is listed twice/);
  }
  const big = good() as Record<string, any>;
  big.lines = Array.from({ length: 81 }, (_, i) => ({ activity_id: "a1", actual_qty: String(i) }));
  assert.equal(parseReportPayload(big, { activityIds: ids }).ok, false);
});

test("payload: 'night' shift accepted, unknown shift rejected, text over limit rejected", () => {
  const n = good() as Record<string, any>;
  n.header.shift = "night";
  const ok = parseReportPayload(n, { activityIds: ids });
  assert.equal(ok.ok && ok.value.header.shift, "night");
  n.header.shift = "swing";
  assert.equal(parseReportPayload(n, { activityIds: ids }).ok, false);
  const long = good() as Record<string, any>;
  long.header.observations = "x".repeat(4001);
  assert.equal(parseReportPayload(long, { activityIds: ids }).ok, false);
});

test("resources: person-days, peak headcount, per-type machine maximum, cutoff respected", () => {
  const r = buildResources(
    [
      { report_date: "2026-10-05", planned_workers: 10, actual_workers: 8 },
      { report_date: "2026-10-05", planned_workers: 5, actual_workers: 6 },
      { report_date: "2026-10-06", planned_workers: 10, actual_workers: 9 },
      { report_date: "2026-10-20", planned_workers: 99, actual_workers: 99 }, // after cutoff
    ],
    [
      { report_date: "2026-10-05", machine_type: "Excavator", machine_count: 2, planned_hours: 16, operating_hours: 12, downtime_hours: 4 },
      { report_date: "2026-10-05", machine_type: "excavator", machine_count: 1, planned_hours: 8, operating_hours: 8, downtime_hours: 0 },
      { report_date: "2026-10-06", machine_type: "Pump", machine_count: 1, planned_hours: 8, operating_hours: 6, downtime_hours: 2 },
    ],
    "2026-10-09",
  );
  assert.equal(r.workforce.plannedPersonDays, "25.00");
  assert.equal(r.workforce.actualPersonDays, "23.00");
  assert.equal(r.workforce.variancePct, "-8.00");
  assert.equal(r.observedPeakWorkersOnAnyDay, 14); // 8 + 6 on 5 Oct
  assert.deepEqual(r.observedMaxMachinesByType, { Excavator: 3, Pump: 1 });
  assert.equal(r.machines.plannedHours, "32.00");
  assert.equal(r.machines.operatingHours, "26.00");
  assert.equal(r.machines.utilizationPct, "81.25");
});

test("resources: no data gives nulls, not zeros", () => {
  const r = buildResources([], [], "2026-10-09");
  assert.equal(r.observedPeakWorkersOnAnyDay, null);
  assert.equal(r.workforce.variancePct, null);
  assert.equal(r.machines.utilizationPct, null);
  assert.deepEqual(r.observedMaxMachinesByType, {});
});
