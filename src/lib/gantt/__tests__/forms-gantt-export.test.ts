import { test } from "node:test";
import assert from "node:assert/strict";
import { FormReader, safeFileName, safeRedirectPath, todayIn } from "../../forms";
import { layoutGantt, type GanttInput } from "../layout";
import { parseReportFilter, reportExportRows } from "../../export/reports";
import { toCsv } from "../../csv/csv";

const fd = (o: Record<string, string>) => new URLSearchParams(o);

test("FormReader: collects field errors, returns decimals as strings, never floats", () => {
  const r = new FormReader(fd({ name: "A", qty: "1,234.50", start: "2026-02-30", n: "x", kind: "zzz", id: "nope" }));
  r.text("name", "Name", { required: true, min: 2 });
  assert.equal(r.decimal("qty", "Quantity", { required: true, min: 0 }), "1234.50");
  assert.equal(r.date("start", "Start"), null);
  assert.equal(r.int("n", "Count"), null);
  assert.equal(r.enumValue("kind", "Kind", ["a", "b"] as const), null);
  assert.equal(r.uuid("id", "Id"), null);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["id", "kind", "n", "name", "start"]);
});

test("FormReader: required, bounds, optional and booleans", () => {
  const r = new FormReader(fd({ a: "", b: "-3", c: "on", d: "  padded  ", e: "a@b.co" }));
  assert.equal(r.text("a", "A", { required: true }), "");
  assert.match(r.errors.a, /required/);
  r.decimal("b", "B", { min: 0 });
  assert.match(r.errors.b, /at least 0/);
  assert.equal(r.bool("c"), true);
  assert.equal(r.bool("missing"), false);
  assert.equal(r.text("d", "D"), "padded");
  assert.equal(r.email("e"), "a@b.co");
  assert.equal(new FormReader(fd({ e: "not-an-email" })).email("e"), "not-an-email");
});

test("FormReader: password length enforced without trimming", () => {
  const short = new FormReader(fd({ p: "short" }));
  short.password("p");
  assert.equal(short.ok, false);
  const ok = new FormReader(fd({ p: " spaces are kept 1 " }));
  assert.equal(ok.password("p"), " spaces are kept 1 ");
  assert.equal(ok.ok, true);
});

test("safeRedirectPath: blocks open redirects", () => {
  assert.equal(safeRedirectPath("/projects/1"), "/projects/1");
  assert.equal(safeRedirectPath("https://evil.example"), "/dashboard");
  assert.equal(safeRedirectPath("//evil.example"), "/dashboard");
  assert.equal(safeRedirectPath("/\\evil.example"), "/dashboard");
  assert.equal(safeRedirectPath("/ok\r\nSet-Cookie: x=1"), "/dashboard");
  assert.equal(safeRedirectPath(null), "/dashboard");
});

test("todayIn: uses the project's timezone, not the server's", () => {
  const instant = new Date("2026-10-23T20:00:00Z"); // 01:30 on the 24th in Kolkata, still the 23rd in New York
  assert.equal(todayIn("Asia/Kolkata", instant), "2026-10-24");
  assert.equal(todayIn("America/New_York", instant), "2026-10-23");
  assert.equal(todayIn("Not/AZone", instant), "2026-10-23"); // falls back to UTC
});

test("safeFileName: strips paths and odd characters", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("C:\\x\\site photo (1).jpg"), "site photo _1_.jpg");
  assert.equal(safeFileName(""), "file");
  assert.equal(safeFileName("a".repeat(300)).length, 120);
});

const items: GanttInput[] = [
  { id: "a", label: "A", start: "2026-10-01", finish: "2026-10-10", actualPct: 50, plannedPct: 60, critical: true, forecastFinish: "2026-10-14", status: "forecast" },
  { id: "b", label: "B", start: "2026-10-11", finish: "2026-10-20", actualPct: null, plannedPct: 0, critical: false, forecastFinish: null, status: "insufficient_data" },
];

test("gantt: bar geometry follows dates exactly; forecast slip and progress widths", () => {
  const g = layoutGantt(items, [{ from: "a", to: "b" }], { today: "2026-10-05", pxPerDay: 10, leftPad: 0, rowHeight: 30, barHeight: 16, headerHeight: 20 });
  const [a, b] = g.bars;
  assert.equal(a.x, 0);
  assert.equal(a.width, 100); // 10 days inclusive
  assert.equal(a.progressWidth, 50);
  assert.equal(a.slipWidth, 40); // 4 calendar days of slip
  assert.equal(b.x, 100);
  assert.equal(b.progressWidth, 0);
  assert.equal(b.slipWidth, null);
  assert.equal(a.y, 20 + 7);
  assert.equal(b.y, 20 + 30 + 7);
  assert.equal(g.todayX, 40);
  assert.equal(g.height, 20 + 60 + 6);
});

test("gantt: dependency connector runs from predecessor finish to successor start; unknown ids skipped", () => {
  const g = layoutGantt(items, [{ from: "a", to: "b" }, { from: "a", to: "ghost" }], { pxPerDay: 10, leftPad: 0 });
  assert.equal(g.deps.length, 1);
  assert.equal(g.deps[0].path, "M100,43 H103 V73 H100"); // touching bars: small elbow, no long overshoot
  const far = layoutGantt([items[0], { ...items[1], start: "2026-10-21", finish: "2026-10-25" }], [{ from: "a", to: "b" }], { pxPerDay: 10, leftPad: 0 });
  assert.equal(far.deps[0].path, "M100,43 H106 V73 H" + far.bars[1].x);
});

test("gantt: range extends to forecast and today; month ticks; empty input safe", () => {
  const g = layoutGantt(items, [], { today: "2026-11-05", pxPerDay: 10, leftPad: 0 });
  assert.equal(g.rangeEnd, "2026-11-05");
  assert.deepEqual(g.ticks.map((t) => t.label), ["Oct 26", "Nov 26"]); // month starts inside the range, including the first day
  assert.equal(layoutGantt([], []).bars.length, 0);
  assert.equal(layoutGantt(items, [], { today: "2025-01-01" }).todayX, null);
});

test("export: rows keep numbers numeric, neutralise formulas, and filters reject junk", () => {
  const rows = reportExportRows([{
    report_date: "2026-10-22", shift: "day", status: "approved", activity_code: "FND", activity_name: "=cmd|' /C calc'!A0",
    unit: "m3", planned_qty: 70, actual_qty: "62.5", planned_workers: null, actual_workers: 24, weather: "Clear", observations: "ok, fine", reviewed_at: null,
  }]);
  const csv = toCsv(rows);
  assert.match(csv, /^report_date,shift/);
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.includes(",70,62.5,,24,"));
  const f = parseReportFilter(new URLSearchParams("from=2026-10-01&to=bad&status=approved;drop&activity=1' or 1=1"));
  assert.deepEqual(f, { from: "2026-10-01" });
  assert.equal(parseReportFilter(new URLSearchParams("status=draft")).status, "draft");
});
