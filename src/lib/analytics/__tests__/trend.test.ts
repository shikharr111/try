import { test } from "node:test";
import assert from "node:assert/strict";
import { delayTrendByMonth } from "../analytics";
import { MON_FRI } from "../../calc/dates";

test("delay trend: groups by start month, excludes dismissed, separates confirmed", () => {
  const t = delayTrendByMonth(
    [
      { project_id: "a", start_date: "2026-09-10", end_date: "2026-09-11", duration_working_days: 2, review_status: "confirmed" },
      { project_id: "a", start_date: "2026-09-20", end_date: "2026-09-21", duration_working_days: "1.5", review_status: "unreviewed" },
      { project_id: "b", start_date: "2026-10-05", end_date: "2026-10-05", duration_working_days: 1, review_status: "dismissed" },
      { project_id: "b", start_date: "2026-10-06", end_date: "2026-10-07", duration_working_days: 3, review_status: "confirmed" },
    ],
    () => MON_FRI,
  );
  assert.deepEqual(t, [
    { month: "2026-09", workingDays: 3.5, confirmedWorkingDays: 2, events: 2 },
    { month: "2026-10", workingDays: 3, confirmedWorkingDays: 3, events: 1 },
  ]);
});

test("delay trend: missing duration falls back to the project's working-day calendar", () => {
  // Fri 2026-10-02 to Mon 2026-10-05 on a Mon-Fri calendar = 2 working days (Fri, Mon)
  const t = delayTrendByMonth([{ project_id: "a", start_date: "2026-10-02", end_date: "2026-10-05", duration_working_days: null, review_status: "unreviewed" }], () => MON_FRI);
  assert.equal(t[0].workingDays, 2);
});

test("delay trend: empty input gives an empty series", () => {
  assert.deepEqual(delayTrendByMonth([], () => MON_FRI), []);
});
