import { test } from "node:test";
import assert from "node:assert/strict";
import { CsvError, parseCsv, safeCell, toCsv } from "../csv";
import { parseDateCell, parseDecimalCell, suggestMapping, templateRows, validateImport } from "../../import/validate";
import type { ValidationContext } from "../../import/validate";

const ctx: ValidationContext = {
  today: "2026-10-23",
  existingActivities: new Map([
    ["EXC", "m3"],
    ["FND", "m3"],
    ["COL", "m3"],
  ]),
};

test("csv: quotes, escaped quotes, embedded newlines, CRLF and BOM", () => {
  const p = parseCsv('﻿code,name\r\nA,"He said ""hi"""\r\nB,"line1\nline2"\r\n');
  assert.deepEqual(p.headers, ["code", "name"]);
  assert.equal(p.rows[0].cells[1], 'He said "hi"');
  assert.equal(p.rows[1].cells[1], "line1\nline2");
  assert.equal(p.rows[1].line, 3);
});

test("csv: delimiter auto-detection (semicolon, tab); commas inside quotes are not delimiters", () => {
  assert.equal(parseCsv("a;b;c\n1;2;3").delimiter, ";");
  assert.equal(parseCsv("a\tb\n1\t2").delimiter, "\t");
  const p = parseCsv('"a,b",c\n1,2');
  assert.equal(p.delimiter, ",");
  assert.deepEqual(p.headers, ["a,b", "c"]);
});

test("csv: unterminated quote, empty file and duplicate headers throw instead of guessing", () => {
  assert.throws(() => parseCsv('a,b\n1,"oops'), CsvError);
  assert.throws(() => parseCsv(""), /empty/);
  assert.throws(() => parseCsv("a,A\n1,2"), /Duplicate column/);
});

test("csv: blank lines skipped, ragged rows reported (not dropped), empty cells preserved", () => {
  const p = parseCsv("a,b,c\n1,2,3\n\n4,5\n,,\n");
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.raggedLines, [4]);
  assert.deepEqual(p.rows[2].cells, ["", "", ""]);
});

test("csv: export neutralises formula injection but keeps numbers numeric", () => {
  assert.equal(safeCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(safeCell("+1"), "'+1");
  assert.equal(safeCell("@cmd"), "'@cmd");
  assert.equal(safeCell(-5), "-5");
  assert.equal(safeCell(null), "");
  const out = toCsv([["a", "b"], ['x,"y"', "=1+1"]]);
  assert.equal(out, 'a,b\r\n"x,""y""",\'=1+1\r\n');
});

test("csv: round trip of awkward content", () => {
  const rows = [["h1", "h2"], ["a\nb", 'q"r'], ["c,d", ""]];
  const parsed = parseCsv(toCsv(rows));
  assert.deepEqual(parsed.headers, ["h1", "h2"]);
  assert.deepEqual(parsed.rows.map((r) => r.cells), [["a\nb", 'q"r'], ["c,d", ""]]);
});

test("cells: dates (ISO and day-first), impossible dates rejected", () => {
  assert.equal(parseDateCell("2026-10-05"), "2026-10-05");
  assert.equal(parseDateCell("5/10/2026"), "2026-10-05");
  assert.equal(parseDateCell("05-10-2026"), "2026-10-05");
  assert.equal(parseDateCell("31/02/2026"), null);
  assert.equal(parseDateCell("2026-13-01"), null);
  assert.equal(parseDateCell("tomorrow"), null);
});

test("cells: decimals with strict thousands separators only", () => {
  assert.equal(parseDecimalCell("1234.5"), "1234.5");
  assert.equal(parseDecimalCell("1,234.50"), "1234.50");
  assert.equal(parseDecimalCell("1,23"), null); // ambiguous European decimal: refused, not guessed
  assert.equal(parseDecimalCell("1e5"), null);
  assert.equal(parseDecimalCell("abc"), null);
  assert.equal(parseDecimalCell("-3"), "-3");
});

test("mapping: aliases and labels resolve; each header used once; unmapped optional = null", () => {
  const m = suggestMapping("activities", ["Task Code", "Task Name", "UoM", "Start Date", "Finish", "Quantity", "Remarks"]);
  assert.equal(m.code, 0);
  assert.equal(m.name, 1);
  assert.equal(m.unit, 2);
  assert.equal(m.planned_start, 3);
  assert.equal(m.planned_finish, 4);
  assert.equal(m.total_qty, 5);
  assert.equal(m.wbs_code, null);
});

const H = ["code", "name", "unit", "planned_start", "planned_finish", "total_qty"];
const map = suggestMapping("activities", H);
const rowsOf = (...r: string[][]) => r.map((cells, i) => ({ line: i + 2, cells }));

test("activities: valid file is committable", () => {
  const r = validateImport("activities", H, rowsOf(["NEW1", "New work", "m2", "2026-11-02", "2026-11-20", "1,200.5"]), map, ctx);
  assert.equal(r.canCommit, true);
  assert.equal(r.validRows[0].total_qty, "1200.5");
});

test("activities: every problem is reported with its line; nothing is silently dropped; commit blocked", () => {
  const r = validateImport(
    "activities",
    H,
    rowsOf(
      ["NEW1", "Good", "m3", "2026-11-02", "2026-11-20", "100"],
      ["NEW2", "Backwards", "m3", "2026-11-20", "2026-11-02", "100"],
      ["NEW3", "Bad qty", "m3", "2026-11-02", "2026-11-20", "ten"],
      ["NEW4", "Bad date", "m3", "31/02/2026", "2026-11-20", "10"],
      ["", "No code", "m3", "2026-11-02", "2026-11-20", "10"],
      ["NEW1", "Dup in file", "m3", "2026-11-02", "2026-11-20", "10"],
      ["EXC", "Unit clash", "kg", "2026-11-02", "2026-11-20", "10"],
    ),
    map,
    ctx,
  );
  assert.equal(r.canCommit, false);
  assert.equal(r.totalRows, 7);
  const byLine = (l: number) => r.issues.filter((i) => i.line === l && i.severity === "error").map((i) => i.message);
  assert.match(byLine(3)[0], /before planned start/);
  assert.match(byLine(4)[0], /not a valid number/);
  assert.match(byLine(5)[0], /not a valid date/);
  assert.match(byLine(6)[0], /missing/);
  assert.match(byLine(7)[0], /Duplicate of line 2/);
  assert.match(byLine(8)[0], /units are never converted/);
  assert.equal(r.validRows.length, 1); // only line 2 is clean
});

test("activities: unmapped required column blocks everything with a clear message", () => {
  const bad = { ...map, unit: null };
  const r = validateImport("activities", H, rowsOf(["A", "n", "m3", "2026-11-02", "2026-11-20", "1"]), bad, ctx);
  assert.equal(r.canCommit, false);
  assert.match(r.issues[0].message, /not mapped/);
});

test("activities: zero quantity and unit alias produce warnings, not errors", () => {
  const r = validateImport("activities", H, rowsOf(["Z", "Zero", "cum", "2026-11-02", "2026-11-20", "0"]), map, ctx);
  assert.equal(r.canCommit, true);
  assert.equal(r.warningCount, 2);
});

test("existing keys: rows that already exist are rejected, never overwritten", () => {
  const r = validateImport(
    "activities",
    H,
    rowsOf(["EXC", "Excavation again", "m3", "2026-11-02", "2026-11-20", "5"]),
    map,
    { ...ctx, existingKeys: new Set(["exc"]) },
  );
  assert.equal(r.canCommit, false);
  assert.match(r.issues[0].message, /never overwritten/);
});

const DH = ["activity_code", "report_date", "actual_qty", "unit"];
const dmap = suggestMapping("daily_reports", DH);

test("daily reports: future dates, unknown activities and unit mismatches are errors", () => {
  const r = validateImport(
    "daily_reports",
    DH,
    rowsOf(
      ["EXC", "2026-10-22", "50", "m3"],
      ["EXC", "2026-10-30", "50", "m3"],
      ["NOPE", "2026-10-22", "50", ""],
      ["FND", "2026-10-22", "50", "kg"],
      ["COL", "2026-10-22", "-4", ""],
    ),
    dmap,
    ctx,
  );
  assert.equal(r.canCommit, false);
  const errs = (l: number) => r.issues.filter((i) => i.line === l && i.severity === "error").map((i) => i.message).join(" | ");
  assert.equal(errs(2), "");
  assert.match(errs(3), /in the future/);
  assert.match(errs(4), /Unknown activity code/);
  assert.match(errs(5), /does not match the activity's approved unit/);
  assert.match(errs(6), /Must be at least 0/);
  assert.equal(r.validRows[0].shift, "day"); // default applied
});

test("activity codes are case-sensitive, like the database: \"exc\" is not \"EXC\"", () => {
  const r = validateImport("daily_reports", DH, rowsOf(["exc", "2026-10-22", "50", ""]), dmap, ctx);
  assert.match(r.issues[0].message, /Unknown activity code "exc"/);
});

test("daily reports: same activity/date/shift twice in a file is a conflict", () => {
  const r = validateImport(
    "daily_reports",
    DH,
    rowsOf(["EXC", "2026-10-22", "50", ""], ["EXC", "22/10/2026", "60", ""]),
    dmap,
    ctx,
  );
  assert.equal(r.canCommit, false);
  assert.match(r.issues[0].message, /Duplicate of line 2/);
});

test("dependencies: unknown codes, self-links and cycles (including via existing links) are rejected at the right row", () => {
  const h = ["predecessor_code", "successor_code", "lag_working_days"];
  const m = suggestMapping("dependencies", h);
  const r = validateImport(
    "dependencies",
    h,
    rowsOf(["FND", "COL", ""], ["COL", "FND", ""], ["EXC", "ZZZ", ""], ["EXC", "EXC", ""], ["EXC", "FND", "x"]),
    m,
    { ...ctx, existingDependencies: [["EXC", "FND"]] },
  );
  const errs = (l: number) => r.issues.filter((i) => i.line === l && i.severity === "error").map((i) => i.message).join(" | ");
  assert.equal(errs(2), "");
  assert.match(errs(3), /cycle/);
  assert.match(errs(4), /Unknown activity code/);
  assert.match(errs(5), /depend on itself/);
  assert.match(errs(6), /whole number/);
  assert.equal(r.canCommit, false);
});

test("equipment: impossible hours rejected", () => {
  const h = ["report_date", "machine_type", "operating_hours", "downtime_hours", "machine_count"];
  const m = suggestMapping("equipment", h);
  const r = validateImport("equipment", h, rowsOf(["2026-10-22", "Crane", "20", "8", "1"], ["2026-10-22", "Pump", "20", "8", "2"]), m, ctx);
  assert.match(r.issues[0].message, /exceed 24 hours/);
  assert.equal(r.issues.length, 1);
});

test("templates are generated from the same definitions and round-trip through the validator", () => {
  for (const kind of ["activities", "dependencies", "daily_reports", "workforce", "equipment"] as const) {
    const [headers, example] = templateRows(kind);
    const parsed = parseCsv(toCsv([headers, example]));
    const m = suggestMapping(kind, parsed.headers);
    assert.deepEqual(
      Object.entries(m).filter(([, v]) => v === null).map(([k]) => k).filter((k) => !headers.includes(k)),
      [],
    );
  }
});
