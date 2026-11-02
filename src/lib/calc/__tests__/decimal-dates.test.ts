import { test } from "node:test";
import assert from "node:assert/strict";
import { Dec, pct } from "../decimal";
import {
  MON_FRI,
  addDays,
  addWorkingDays,
  countWorkingDays,
  diffDays,
  nextWorkingDay,
  weekday,
  workingDayAt,
  isValidISODate,
} from "../dates";

test("Dec: 0.1 + 0.2 is exactly 0.3 (no binary float error)", () => {
  assert.equal(Dec.of("0.1").add("0.2").toString(), "0.3");
  assert.ok(Dec.of("0.1").add("0.2").eq("0.3"));
  assert.notEqual(0.1 + 0.2, 0.3); // sanity: plain floats fail
});

test("Dec: division rounds half away from zero", () => {
  assert.equal(Dec.of(1).div(3).toFixed(4), "0.3333");
  assert.equal(Dec.of(2).div(3).toFixed(2), "0.67");
  assert.equal(Dec.of(-2).div(3).toFixed(2), "-0.67");
  assert.equal(Dec.of("2.5").toFixed(0), "3");
  assert.equal(Dec.of("-2.5").toFixed(0), "-3");
});

test("Dec: parsing more than 9 decimals rounds, invalid strings throw", () => {
  assert.equal(Dec.of("1.0000000005").toString(), "1.000000001");
  assert.equal(Dec.of("1.0000000004").toString(), "1");
  assert.throws(() => Dec.of("abc"), TypeError);
  assert.throws(() => Dec.of("1e5"), TypeError);
  assert.throws(() => Dec.of(Number.NaN), TypeError);
});

test("Dec: division by zero throws; pct() returns null for zero whole", () => {
  assert.throws(() => Dec.of(1).div(0), RangeError);
  assert.equal(pct(5, 0), null);
  assert.equal(pct(40, 1000)?.toString(), "4");
});

test("Dec: ceilToInt", () => {
  assert.equal(Dec.of(2).ceilToInt(), 2);
  assert.equal(Dec.of("2.000000001").ceilToInt(), 3);
  assert.equal(Dec.of(0).ceilToInt(), 0);
  assert.equal(Dec.of("7.5").ceilToInt(), 8);
});

test("Dec: sum, min, max, negative formatting", () => {
  assert.equal(Dec.sum(["1.1", "2.2", "3.3"]).toString(), "6.6");
  assert.equal(Dec.min("3", "2").toString(), "2");
  assert.equal(Dec.max("-3", "-2").toString(), "-2");
  assert.equal(Dec.of("-0.004").toFixed(2), "0.00"); // no "-0.00"
});

test("dates: weekday and validation", () => {
  assert.equal(weekday("2026-10-23"), 5); // Friday
  assert.equal(weekday("1970-01-01"), 4); // Thursday
  assert.equal(weekday("1969-12-31"), 3); // Wednesday (negative epoch day)
  assert.ok(isValidISODate("2028-02-29"));
  assert.ok(!isValidISODate("2026-02-29"));
  assert.ok(!isValidISODate("2026-02-30"));
  assert.ok(!isValidISODate("26-02-01"));
});

test("dates: addDays/diffDays across month and leap boundaries", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(diffDays("2026-10-16", "2026-10-21"), 5);
  assert.equal(diffDays("2026-10-21", "2026-10-16"), -5);
});

test("dates: working-day counting with weekends and holidays", () => {
  assert.equal(countWorkingDays(MON_FRI, "2026-10-19", "2026-10-25"), 5);
  const withHoliday = { ...MON_FRI, holidays: ["2026-10-21"] };
  assert.equal(countWorkingDays(withHoliday, "2026-10-19", "2026-10-25"), 4);
  assert.equal(countWorkingDays(MON_FRI, "2026-10-25", "2026-10-19"), 0);
});

test("dates: next / indexed / offset working days", () => {
  assert.equal(nextWorkingDay(MON_FRI, "2026-10-23"), "2026-10-26"); // Fri -> Mon
  assert.equal(workingDayAt(MON_FRI, "2026-10-23", 0), "2026-10-23");
  assert.equal(workingDayAt(MON_FRI, "2026-10-23", 1), "2026-10-26");
  assert.equal(workingDayAt(MON_FRI, "2026-10-24", 0), "2026-10-26"); // Saturday start rolls forward
  assert.equal(addWorkingDays(MON_FRI, "2026-10-23", -1), "2026-10-22");
  assert.equal(addWorkingDays(MON_FRI, "2026-10-26", -1), "2026-10-23");
  assert.equal(addWorkingDays(MON_FRI, "2026-10-23", 5), "2026-10-30");
});

test("dates: calendar with no working days is rejected", () => {
  assert.throws(() => countWorkingDays({ workingWeekdays: [], holidays: [] }, "2026-10-01", "2026-10-05"), RangeError);
});
