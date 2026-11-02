import { addDays, compareDates, isValidISODate, type ISODate } from "../calc/dates";
import { Dec } from "../calc/decimal";
import { CycleError } from "../calc/types";
import { topologicalOrder } from "../calc/cpm";
import { normalizeUnit, unitsMatch } from "../calc/units";
import { IMPORT_COLUMNS, NATURAL_KEYS, type ColumnDef, type ImportKind } from "./definitions";

/**
 * Import validation. Pure and deterministic; the database re-validates (constraints + RPCs), so this
 * layer exists to give users a complete, row-level preview BEFORE anything is written.
 *
 * Policy: all-or-nothing. If any row has an error, nothing is committed; no row is ever dropped silently.
 */

export interface RowIssue {
  /** 1-based line number in the source file (header is line 1) */
  line: number;
  column?: string;
  severity: "error" | "warning";
  message: string;
}

export type NormalizedRow = Record<string, string>;

export interface ValidationContext {
  today: ISODate;
  /** Existing activities of the project: code -> unit */
  existingActivities: ReadonlyMap<string, string>;
  /** Natural keys already in the database for this kind (joined with "|", lower-cased) */
  existingKeys?: ReadonlySet<string>;
  /** Existing dependencies in the target draft revision as "pred|succ" (codes) */
  existingDependencies?: ReadonlyArray<readonly [string, string]>;
  /** Activity codes introduced by an activities file being imported in the same session (optional) */
  pendingActivityCodes?: ReadonlySet<string>;
}

export interface ValidationResult {
  kind: ImportKind;
  totalRows: number;
  validRows: NormalizedRow[];
  issues: RowIssue[];
  errorCount: number;
  warningCount: number;
  /** True only when there are zero errors and at least one row. */
  canCommit: boolean;
}

export type ColumnMapping = Record<string, number | null>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Suggests a header->column mapping from header names and aliases. Each header is used at most once. */
export function suggestMapping(kind: ImportKind, headers: readonly string[]): ColumnMapping {
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  const normalized = headers.map(norm);
  // exact key/label first, then aliases
  for (const pass of ["exact", "alias"] as const) {
    for (const col of IMPORT_COLUMNS[kind]) {
      if (mapping[col.key] != null) continue;
      const names = pass === "exact" ? [norm(col.key), norm(col.label)] : col.aliases.map(norm);
      const idx = normalized.findIndex((h, i) => !used.has(i) && h !== "" && names.includes(h));
      if (idx >= 0) {
        mapping[col.key] = idx;
        used.add(idx);
      }
    }
  }
  for (const col of IMPORT_COLUMNS[kind]) if (mapping[col.key] === undefined) mapping[col.key] = null;
  return mapping;
}

export function missingRequiredColumns(kind: ImportKind, mapping: ColumnMapping): string[] {
  return IMPORT_COLUMNS[kind].filter((c) => c.required && mapping[c.key] == null).map((c) => c.label);
}

/** Accepts YYYY-MM-DD and DD/MM/YYYY or DD-MM-YYYY (day first). Returns null when not a real calendar date. */
export function parseDateCell(raw: string): ISODate | null {
  const s = raw.trim();
  let iso: string | null = null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return iso !== null && isValidISODate(iso) ? iso : null;
}

/** Plain decimal, optionally with strict thousands separators (1,234.56). Returns a canonical string or null. */
export function parseDecimalCell(raw: string): string | null {
  const s = raw.trim().replace(/^\+/, "");
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return s.replace(/,/g, "");
  return null;
}

function checkCell(col: ColumnDef, raw: string, line: number, issues: RowIssue[]): string | null {
  const v = raw.trim();
  if (v === "") {
    if (col.required) issues.push({ line, column: col.label, severity: "error", message: "Required value is missing" });
    return null;
  }
  switch (col.type) {
    case "text":
      if (col.maxLength && v.length > col.maxLength) {
        issues.push({ line, column: col.label, severity: "error", message: `Longer than ${col.maxLength} characters` });
        return null;
      }
      return v;
    case "date": {
      const d = parseDateCell(v);
      if (!d) {
        issues.push({ line, column: col.label, severity: "error", message: `"${v}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)` });
        return null;
      }
      return d;
    }
    case "decimal": {
      const d = parseDecimalCell(v);
      if (d === null) {
        issues.push({ line, column: col.label, severity: "error", message: `"${v}" is not a valid number` });
        return null;
      }
      if (col.min !== undefined && Dec.of(d).lt(col.min)) {
        issues.push({ line, column: col.label, severity: "error", message: `Must be at least ${col.min}` });
        return null;
      }
      if (Dec.of(d).gt("99999999999999")) {
        issues.push({ line, column: col.label, severity: "error", message: "Number is too large" });
        return null;
      }
      return d;
    }
    case "int": {
      if (!/^-?\d+$/.test(v)) {
        issues.push({ line, column: col.label, severity: "error", message: `"${v}" is not a whole number` });
        return null;
      }
      if (col.min !== undefined && Number(v) < col.min) {
        issues.push({ line, column: col.label, severity: "error", message: `Must be at least ${col.min}` });
        return null;
      }
      return v;
    }
    case "enum": {
      const e = v.toLowerCase();
      if (!col.enumValues?.includes(e)) {
        issues.push({ line, column: col.label, severity: "error", message: `Must be one of: ${col.enumValues?.join(", ")}` });
        return null;
      }
      return e;
    }
  }
}

export function validateImport(
  kind: ImportKind,
  headers: readonly string[],
  rows: readonly { line: number; cells: readonly string[] }[],
  mapping: ColumnMapping,
  ctx: ValidationContext,
): ValidationResult {
  const issues: RowIssue[] = [];
  const cols = IMPORT_COLUMNS[kind];
  const missing = missingRequiredColumns(kind, mapping);
  for (const m of missing) issues.push({ line: 1, column: m, severity: "error", message: "Required column is not mapped" });
  for (const col of cols) {
    const idx = mapping[col.key];
    if (idx != null && (idx < 0 || idx >= headers.length)) {
      issues.push({ line: 1, column: col.label, severity: "error", message: "Mapped to a column that does not exist" });
    }
  }
  const mappedIdx = Object.values(mapping).filter((i): i is number => i != null);
  if (new Set(mappedIdx).size !== mappedIdx.length) {
    issues.push({ line: 1, severity: "error", message: "The same file column is mapped to more than one field" });
  }
  if (issues.some((i) => i.severity === "error")) {
    return summarize(kind, rows.length, [], issues);
  }

  const out: { line: number; row: NormalizedRow }[] = [];
  const seenKeys = new Map<string, number>();
  const keyCols = NATURAL_KEYS[kind];

  for (const r of rows) {
    const rowIssues: RowIssue[] = [];
    if (r.cells.length !== headers.length) {
      rowIssues.push({ line: r.line, severity: "error", message: `Row has ${r.cells.length} cells but the header has ${headers.length}` });
    }
    const row: NormalizedRow = {};
    for (const col of cols) {
      const idx = mapping[col.key];
      const raw = idx == null ? "" : (r.cells[idx] ?? "");
      const v = checkCell(col, raw, r.line, rowIssues);
      if (v !== null) row[col.key] = v;
    }
    if (kind !== "activities" && kind !== "dependencies") row.shift = row.shift ?? "day";
    semanticChecks(kind, row, r.line, ctx, rowIssues);

    // duplicates (only when the key columns themselves were valid)
    if (!rowIssues.some((i) => i.severity === "error" && keyCols.some((k) => i.column === cols.find((c) => c.key === k)?.label))) {
      const key = keyCols.map((k) => (row[k] ?? "").toLowerCase()).join("|");
      const first = seenKeys.get(key);
      if (first !== undefined) {
        rowIssues.push({ line: r.line, severity: "error", message: `Duplicate of line ${first} (same ${keyCols.join(" + ")})` });
      } else {
        seenKeys.set(key, r.line);
        if (ctx.existingKeys?.has(key)) {
          rowIssues.push({
            line: r.line,
            severity: "error",
            message: `Already exists in the project (${keyCols.join(" + ")}); existing records are never overwritten`,
          });
        }
      }
    }
    issues.push(...rowIssues);
    out.push({ line: r.line, row });
  }

  if (kind === "dependencies") dependencyGraphChecks(out, ctx, issues);

  const badLines = new Set(issues.filter((i) => i.severity === "error").map((i) => i.line));
  return summarize(kind, rows.length, out.filter((o) => !badLines.has(o.line)).map((o) => o.row), issues);
}

function semanticChecks(kind: ImportKind, row: NormalizedRow, line: number, ctx: ValidationContext, issues: RowIssue[]) {
  const known = (code: string) => ctx.existingActivities.has(code) || ctx.pendingActivityCodes?.has(code) === true;
  const err = (column: string, message: string) => issues.push({ line, column, severity: "error", message });
  const warn = (column: string, message: string) => issues.push({ line, column, severity: "warning", message });

  if (kind === "activities") {
    if (row.planned_start && row.planned_finish && compareDates(row.planned_finish, row.planned_start) < 0) {
      err("Planned finish", "Planned finish is before planned start");
    }
    const existingUnit = row.code ? ctx.existingActivities.get(row.code) : undefined;
    if (existingUnit !== undefined && row.unit && !unitsMatch(existingUnit, row.unit)) {
      err("Unit", `Activity ${row.code} already exists with unit "${existingUnit}"; units are never converted silently`);
    }
    if (row.total_qty && Dec.of(row.total_qty).isZero()) warn("Total quantity", "Total quantity is zero; quantity-based progress will be undefined");
    if (row.unit && normalizeUnit(row.unit) !== row.unit.toLowerCase()) {
      warn("Unit", `Unit "${row.unit}" is treated as "${normalizeUnit(row.unit)}"`);
    }
    return;
  }
  if (kind === "dependencies") {
    if (row.predecessor_code && row.predecessor_code === row.successor_code) err("Successor code", "An activity cannot depend on itself");
    return;
  }

  // reporting kinds
  if (row.report_date && compareDates(row.report_date, ctx.today) > 0) {
    err("Report date", `Report date ${row.report_date} is in the future`);
  }
  if (row.report_date && compareDates(row.report_date, addDays(ctx.today, -365)) < 0) {
    warn("Report date", "Report date is more than a year old");
  }
  if (row.activity_code) {
    if (!known(row.activity_code)) err("Activity code", `Unknown activity code "${row.activity_code}"`);
    else if (kind === "daily_reports" && row.unit) {
      const u = ctx.existingActivities.get(row.activity_code);
      if (u !== undefined && !unitsMatch(u, row.unit)) {
        err("Unit", `Unit "${row.unit}" does not match the activity's approved unit "${u}"`);
      }
    }
  }
  if (kind === "daily_reports" && row.planned_qty && row.actual_qty) {
    if (Dec.of(row.actual_qty).gt(Dec.of(row.planned_qty).mul(5)) && Dec.of(row.planned_qty).gt(0)) {
      warn("Actual quantity", "Actual quantity is more than 5x the planned quantity; check units and decimals");
    }
  }
  if (kind === "equipment") {
    const count = Number(row.machine_count ?? "1");
    const op = Dec.of(row.operating_hours ?? "0");
    const down = Dec.of(row.downtime_hours ?? "0");
    if (op.add(down).gt(24 * Math.max(count, 1))) {
      err("Operating hours", "Operating + downtime hours exceed 24 hours per machine");
    }
  }
}

function dependencyGraphChecks(
  rows: { line: number; row: NormalizedRow }[],
  ctx: ValidationContext,
  issues: RowIssue[],
) {
  const known = (code: string) => ctx.existingActivities.has(code) || ctx.pendingActivityCodes?.has(code) === true;
  const edges: { predecessorId: string; successorId: string }[] = (ctx.existingDependencies ?? []).map(([p, s]) => ({
    predecessorId: p,
    successorId: s,
  }));
  const goodRows: { line: number; row: NormalizedRow }[] = [];
  for (const { line, row } of rows) {
    if (!row.predecessor_code || !row.successor_code) continue;
    let ok = true;
    for (const [col, code] of [["Predecessor code", row.predecessor_code], ["Successor code", row.successor_code]] as const) {
      if (!known(code)) {
        issues.push({ line, column: col, severity: "error", message: `Unknown activity code "${code}"` });
        ok = false;
      }
    }
    if (ok && row.predecessor_code !== row.successor_code) goodRows.push({ line, row });
  }
  // add edges one by one so the error points at the row that closes the cycle
  const ids = new Set<string>([...ctx.existingActivities.keys(), ...(ctx.pendingActivityCodes ?? [])]);
  for (const { line, row } of goodRows) {
    const candidate = [...edges, { predecessorId: row.predecessor_code, successorId: row.successor_code }];
    try {
      topologicalOrder([...ids], candidate);
      edges.push(candidate[candidate.length - 1]);
    } catch (e) {
      if (e instanceof CycleError) {
        issues.push({ line, column: "Successor code", severity: "error", message: "This dependency would create a cycle" });
      } else throw e;
    }
  }
}

function summarize(kind: ImportKind, total: number, valid: NormalizedRow[], issues: RowIssue[]): ValidationResult {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    kind,
    totalRows: total,
    validRows: valid,
    issues: issues.sort((a, b) => a.line - b.line),
    errorCount,
    warningCount,
    canCommit: errorCount === 0 && total > 0 && valid.length === total,
  };
}

/** Templates (header + one example row) generated from the same column definitions the validator uses. */
export function templateRows(kind: ImportKind): string[][] {
  const cols = IMPORT_COLUMNS[kind];
  return [cols.map((c) => c.key), cols.map((c) => c.example)];
}
