import "server-only";
import { parseCsv, CsvError } from "../csv/csv";
import { IMPORT_COLUMNS, NATURAL_KEYS, type ImportKind } from "../import/definitions";
import { suggestMapping, validateImport, type ColumnMapping, type ValidationResult } from "../import/validate";
import { fetchAll, type ProjectBundle } from "./project-data";
import type { ProjectRow, Supabase } from "./session";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, readXlsx, SheetError } from "./xlsx";

export const IMPORT_KINDS = Object.keys(IMPORT_COLUMNS) as ImportKind[];
export const isImportKind = (s: string): s is ImportKind => (IMPORT_KINDS as string[]).includes(s);

export interface ParsedSheet { headers: string[]; rows: { line: number; cells: string[] }[] }

/** Parses an uploaded CSV or xlsx file. Throws SheetError with a user-safe message. */
export async function parseUpload(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new SheetError("The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new SheetError("File is larger than 5 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    try {
      const p = parseCsv(await file.text(), { maxRows: MAX_IMPORT_ROWS });
      return { headers: p.headers, rows: p.rows };
    } catch (e) {
      throw new SheetError(e instanceof CsvError ? e.message : "The CSV file could not be read.");
    }
  }
  throw new SheetError("Unsupported file type. Upload a .csv or .xlsx file (legacy .xls is not supported).");
}

export function parseMapping(raw: string | null, kind: ImportKind, headers: string[]): ColumnMapping {
  if (!raw) return suggestMapping(kind, headers);
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const m: ColumnMapping = {};
    for (const col of IMPORT_COLUMNS[kind]) {
      const v = obj[col.key];
      m[col.key] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < headers.length ? v : null;
    }
    return m;
  } catch {
    return suggestMapping(kind, headers);
  }
}

/**
 * Builds the validation context from the database with the caller's own session (RLS applies), so the
 * same checks run in preview and at commit time. Nothing sent by the browser is trusted.
 */
export async function validateAgainstProject(
  supabase: Supabase, project: ProjectRow, bundle: Pick<ProjectBundle, "today">, kind: ImportKind, sheet: ParsedSheet, mapping: ColumnMapping,
): Promise<{ result: ValidationResult; draftId: string | null }> {
  const [acts, { data: draft }] = await Promise.all([
    fetchAll<{ id: string; code: string; unit: string }>((f, t) => supabase.from("activities").select("id, code, unit").eq("project_id", project.id).order("code").range(f, t)),
    supabase.from("baseline_revisions").select("id").eq("project_id", project.id).eq("status", "draft").maybeSingle(),
  ]);
  const draftId = (draft?.id as string | undefined) ?? null;
  const codeById = new Map<string, string>(acts.map((a) => [a.id, a.code] as [string, string]));
  const existingActivities = new Map<string, string>(acts.map((a) => [a.code, a.unit] as [string, string]));
  const keys = new Set<string>();
  let existingDependencies: [string, string][] = [];

  if (kind === "activities") {
    for (const a of acts) keys.add(a.code.toLowerCase());
  } else if (kind === "dependencies") {
    if (draftId) {
      const deps = await fetchAll<{ predecessor_id: string; successor_id: string }>((f, t) => supabase.from("activity_dependencies").select("predecessor_id, successor_id").eq("revision_id", draftId).range(f, t));
      existingDependencies = deps.map((d) => [codeById.get(d.predecessor_id) ?? "", codeById.get(d.successor_id) ?? ""] as [string, string]);
      for (const [p, s] of existingDependencies) keys.add(`${p}|${s}`.toLowerCase());
    }
  } else if (kind === "daily_reports") {
    const lines = await fetchAll<{ report_date: string; shift: string; activity_id: string }>((f, t) => supabase.from("daily_report_lines").select("report_date, shift, activity_id").eq("project_id", project.id).range(f, t));
    for (const l of lines) keys.add(`${l.report_date}|${l.shift}|${codeById.get(l.activity_id) ?? ""}`.toLowerCase());
  } else if (kind === "workforce") {
    const rec = await fetchAll<{ report_date: string; activity_id: string | null; trade: string; report: { shift: string } | null }>((f, t) => supabase.from("workforce_records").select("report_date, activity_id, trade, report:daily_reports(shift)").eq("project_id", project.id).range(f, t));
    for (const r of rec) keys.add(`${r.report_date}|${r.report?.shift ?? "day"}|${r.activity_id ? codeById.get(r.activity_id) ?? "" : ""}|${r.trade}`.toLowerCase());
  } else {
    const rec = await fetchAll<{ report_date: string; activity_id: string | null; machine_type: string; report: { shift: string } | null }>((f, t) => supabase.from("equipment_records").select("report_date, activity_id, machine_type, report:daily_reports(shift)").eq("project_id", project.id).range(f, t));
    for (const r of rec) keys.add(`${r.report_date}|${r.report?.shift ?? "day"}|${r.activity_id ? codeById.get(r.activity_id) ?? "" : ""}|${r.machine_type}`.toLowerCase());
  }
  void NATURAL_KEYS; // key layout must match NATURAL_KEYS[kind]; covered by the key builders above

  const result = validateImport(kind, sheet.headers, sheet.rows, mapping, { today: bundle.today, existingActivities, existingKeys: keys, existingDependencies });
  return { result, draftId };
}
