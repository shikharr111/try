import { isValidISODate } from "../calc/dates";
import { Dec } from "../calc/decimal";
import { DELAY_CATEGORIES } from "../ai/schema";
import { parseDecimalCell } from "../import/validate";

/**
 * Server-side validation of the daily-report form payload (the client sends one JSON document).
 * Client checks are a convenience only: this is what the database RPC receives.
 * Quantities stay decimal strings end to end; nothing is converted to a float.
 */
export interface ReportLinePayload {
  activity_id: string;
  planned_workers: string | null;
  actual_workers: string | null;
  planned_qty: string | null;
  actual_qty: string;
  material_available: boolean | null;
  material_notes: string | null;
  material_consumed_qty: string | null;
  material_unit: string | null;
  observations: string | null;
}
export interface WorkforcePayload { activity_id: string | null; trade: string; planned_workers: string; actual_workers: string; hours_worked: string | null }
export interface EquipmentPayload {
  activity_id: string | null; machine_type: string; machine_count: number; planned_hours: string;
  operating_hours: string; downtime_hours: string; downtime_reason: string | null;
}
export interface DelayPayload { activity_id: string | null; category: (typeof DELAY_CATEGORIES)[number]; duration_working_days: string | null; description: string }
export interface ReportPayload {
  header: { report_date: string; shift: "day" | "night"; weather: string | null; site_conditions: string | null; observations: string | null };
  lines: ReportLinePayload[];
  workforce: WorkforcePayload[];
  equipment: EquipmentPayload[];
  delays: DelayPayload[];
}
export type PayloadResult = { ok: true; value: ReportPayload } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseReportPayload(raw: unknown, ctx: { activityIds: ReadonlySet<string> }): PayloadResult {
  const errors: string[] = [];
  const err = (p: string, m: string) => { if (errors.length < 25) errors.push(`${p}: ${m}`); };
  if (!isObj(raw)) return { ok: false, errors: ["Invalid form data"] };

  const text = (o: Record<string, unknown>, k: string, p: string, max: number, required = false): string | null => {
    const v = o[k];
    if (v === undefined || v === null || v === "") { if (required) err(`${p}.${k}`, "is required"); return null; }
    if (typeof v !== "string") { err(`${p}.${k}`, "must be text"); return null; }
    const t = v.trim();
    if (t === "") { if (required) err(`${p}.${k}`, "is required"); return null; }
    if (t.length > max) { err(`${p}.${k}`, `must be at most ${max} characters`); return null; }
    return t;
  };
  const dec = (o: Record<string, unknown>, k: string, p: string, required = false): string | null => {
    const v = o[k];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) { if (required) err(`${p}.${k}`, "is required"); return null; }
    const d = typeof v === "string" ? parseDecimalCell(v) : null;
    if (d === null) { err(`${p}.${k}`, "must be a number"); return null; }
    if (Dec.of(d).isNegative()) { err(`${p}.${k}`, "cannot be negative"); return null; }
    if (Dec.of(d).gt("99999999999999")) { err(`${p}.${k}`, "is too large"); return null; }
    return d;
  };
  const activityRef = (o: Record<string, unknown>, p: string, required: boolean): string | null => {
    const v = o.activity_id;
    if (v === undefined || v === null || v === "") { if (required) err(`${p}.activity_id`, "choose an activity"); return null; }
    if (typeof v !== "string" || !ctx.activityIds.has(v)) { err(`${p}.activity_id`, "is not an activity of this project"); return null; }
    return v;
  };
  const arr = (k: string, max: number): unknown[] => {
    const v = raw[k];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) { err(k, "must be a list"); return []; }
    if (v.length > max) { err(k, `has more than ${max} rows`); return v.slice(0, max); }
    return v;
  };

  const h = isObj(raw.header) ? raw.header : (err("header", "is missing"), {} as Record<string, unknown>);
  const date = typeof h.report_date === "string" && isValidISODate(h.report_date) ? h.report_date : (err("header.report_date", "must be a valid date"), "");
  const shift = h.shift === "night" ? "night" : h.shift === "day" || h.shift === undefined || h.shift === "" ? "day" : (err("header.shift", "must be day or night"), "day");
  const header = {
    report_date: date, shift: shift as "day" | "night",
    weather: text(h, "weather", "header", 200), site_conditions: text(h, "site_conditions", "header", 1000), observations: text(h, "observations", "header", 4000),
  };

  const seen = new Set<string>();
  const lines: ReportLinePayload[] = arr("lines", 80).map((x, i) => {
    const p = `lines[${i}]`;
    const o = isObj(x) ? x : (err(p, "is invalid"), {} as Record<string, unknown>);
    const activity_id = activityRef(o, p, true) ?? "";
    if (activity_id) {
      if (seen.has(activity_id)) err(`${p}.activity_id`, "this activity appears twice in the report");
      seen.add(activity_id);
    }
    const ma = o.material_available;
    return {
      activity_id,
      planned_workers: dec(o, "planned_workers", p), actual_workers: dec(o, "actual_workers", p),
      planned_qty: dec(o, "planned_qty", p), actual_qty: dec(o, "actual_qty", p, true) ?? "0",
      material_available: ma === true || ma === "yes" ? true : ma === false || ma === "no" ? false : null,
      material_notes: text(o, "material_notes", p, 500), material_consumed_qty: dec(o, "material_consumed_qty", p),
      material_unit: text(o, "material_unit", p, 20), observations: text(o, "observations", p, 2000),
    };
  });
  if (lines.length === 0) err("lines", "add at least one activity line");

  const workforce: WorkforcePayload[] = arr("workforce", 80).map((x, i) => {
    const p = `workforce[${i}]`;
    const o = isObj(x) ? x : (err(p, "is invalid"), {} as Record<string, unknown>);
    return {
      activity_id: activityRef(o, p, false), trade: text(o, "trade", p, 80, true) ?? "",
      planned_workers: dec(o, "planned_workers", p) ?? "0", actual_workers: dec(o, "actual_workers", p, true) ?? "0", hours_worked: dec(o, "hours_worked", p),
    };
  });
  const wfKeys = new Set<string>();
  for (const [i, w] of workforce.entries()) {
    const k = `${w.activity_id ?? ""}|${w.trade.toLowerCase()}`;
    if (wfKeys.has(k)) err(`workforce[${i}].trade`, "this trade is listed twice for the same activity");
    wfKeys.add(k);
  }

  const equipment: EquipmentPayload[] = arr("equipment", 80).map((x, i) => {
    const p = `equipment[${i}]`;
    const o = isObj(x) ? x : (err(p, "is invalid"), {} as Record<string, unknown>);
    const countRaw = typeof o.machine_count === "string" ? o.machine_count.trim() : o.machine_count;
    let count = 1;
    if (countRaw !== undefined && countRaw !== "" && countRaw !== null) {
      const n = typeof countRaw === "number" ? countRaw : /^\d+$/.test(String(countRaw)) ? Number(countRaw) : NaN;
      if (!Number.isInteger(n) || n < 0 || n > 1000) err(`${p}.machine_count`, "must be a whole number from 0 to 1000");
      else count = n;
    }
    const operating = dec(o, "operating_hours", p, true) ?? "0";
    const downtime = dec(o, "downtime_hours", p) ?? "0";
    if (Dec.of(operating).add(downtime).gt(24 * Math.max(count, 1))) err(`${p}.operating_hours`, "operating + downtime exceeds 24 hours per machine");
    return {
      activity_id: activityRef(o, p, false), machine_type: text(o, "machine_type", p, 80, true) ?? "", machine_count: count,
      planned_hours: dec(o, "planned_hours", p) ?? "0", operating_hours: operating, downtime_hours: downtime, downtime_reason: text(o, "downtime_reason", p, 300),
    };
  });
  const eqKeys = new Set<string>();
  for (const [i, e] of equipment.entries()) {
    const k = `${e.activity_id ?? ""}|${e.machine_type.toLowerCase()}`;
    if (eqKeys.has(k)) err(`equipment[${i}].machine_type`, "this machine type is listed twice for the same activity");
    eqKeys.add(k);
  }

  const delays: DelayPayload[] = arr("delays", 20).map((x, i) => {
    const p = `delays[${i}]`;
    const o = isObj(x) ? x : (err(p, "is invalid"), {} as Record<string, unknown>);
    const cat = o.category;
    const category = typeof cat === "string" && (DELAY_CATEGORIES as readonly string[]).includes(cat) ? (cat as DelayPayload["category"]) : (err(`${p}.category`, "choose a reason"), "other_unknown" as const);
    return { activity_id: activityRef(o, p, false), category, duration_working_days: dec(o, "duration_working_days", p), description: text(o, "description", p, 1000, true) ?? "" };
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { header, lines, workforce, equipment, delays } };
}
