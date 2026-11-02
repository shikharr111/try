import { Dec } from "../calc/decimal";
import { compareDates, isValidISODate, type ISODate } from "../calc/dates";
import { parseDateCell, parseDecimalCell } from "../import/validate";

export interface DailyTarget { plan_date: ISODate; planned_qty: string }
export type ParsedDailyPlan = { ok: true; rows: DailyTarget[] } | { ok: false; errors: string[] };

/**
 * Parses pasted lines of "date, quantity" (comma, semicolon or tab separated) into explicit daily targets.
 * Mirrors the database rules so users get precise line errors first: dates inside the activity span, no
 * duplicate dates, non-negative quantities, and a total that equals the approved quantity exactly (decimal-safe).
 * Empty input is valid and means "use the linear distribution".
 */
export function parseDailyPlan(text: string, span: { start: ISODate; finish: ISODate }, total: string): ParsedDailyPlan {
  const errors: string[] = [];
  const rows: DailyTarget[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length > 3700) return { ok: false, errors: ["Too many lines (limit 3700)"] };
  lines.forEach((line, i) => {
    const n = i + 1;
    const parts = line.split(/[,;\t]/).map((p) => p.trim());
    if (parts.length !== 2) { errors.push(`Line ${n}: expected "date, quantity"`); return; }
    const date = parseDateCell(parts[0]);
    const qty = parseDecimalCell(parts[1]);
    if (!date) { errors.push(`Line ${n}: "${parts[0]}" is not a valid date`); return; }
    if (qty === null) { errors.push(`Line ${n}: "${parts[1]}" is not a valid number`); return; }
    if (Dec.of(qty).isNegative()) { errors.push(`Line ${n}: quantity cannot be negative`); return; }
    if (!isValidISODate(date) || compareDates(date, span.start) < 0 || compareDates(date, span.finish) > 0) {
      errors.push(`Line ${n}: ${date} is outside the planned span ${span.start} to ${span.finish}`); return;
    }
    if (seen.has(date)) { errors.push(`Line ${n}: ${date} appears more than once`); return; }
    seen.add(date);
    rows.push({ plan_date: date, planned_qty: qty });
  });
  if (errors.length === 0 && rows.length > 0) {
    const sum = Dec.sum(rows.map((r) => r.planned_qty));
    if (!sum.eq(total)) errors.push(`Targets add up to ${sum.toString()} but the approved total is ${Dec.of(total).toString()}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, rows: rows.sort((a, b) => compareDates(a.plan_date, b.plan_date)) };
}
