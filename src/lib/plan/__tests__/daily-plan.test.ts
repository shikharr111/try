import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDailyPlan } from "../daily-plan";

const span = { start: "2026-10-05", finish: "2026-10-09" };

test("daily plan: valid targets (mixed separators and date styles) sort by date and sum exactly", () => {
  const r = parseDailyPlan("2026-10-07, 0.1\n05/10/2026;0.2\n2026-10-06\t0.3", span, "0.6");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.rows.map((x) => x.plan_date), ["2026-10-05", "2026-10-06", "2026-10-07"]);
});

test("daily plan: 0.1 + 0.2 + 0.3 equals 0.6 exactly (no float drift)", () => {
  assert.equal(parseDailyPlan("2026-10-05,0.1\n2026-10-06,0.2\n2026-10-07,0.3", span, "0.6").ok, true);
});

test("daily plan: wrong total, out-of-span, duplicate, malformed and negative lines are each reported", () => {
  const r = parseDailyPlan("2026-10-05,10\n2026-10-05,5\n2026-10-20,1\nbad line\n2026-10-06,-1\n2026-10-07,x", span, "100");
  assert.equal(r.ok, false);
  if (!r.ok) {
    const all = r.errors.join("\n");
    assert.match(all, /Line 2: 2026-10-05 appears more than once/);
    assert.match(all, /Line 3: 2026-10-20 is outside/);
    assert.match(all, /Line 4: expected/);
    assert.match(all, /Line 5: quantity cannot be negative/);
    assert.match(all, /Line 6: "x" is not a valid number/);
  }
  const wrong = parseDailyPlan("2026-10-05,10", span, "100");
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.match(wrong.errors[0], /add up to 10 but the approved total is 100/);
});

test("daily plan: empty input means linear distribution", () => {
  const r = parseDailyPlan("  \n\n", span, "100");
  assert.deepEqual(r, { ok: true, rows: [] });
});
