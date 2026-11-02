const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-23" -> "23 Oct 2026". Pure string handling: no timezone shifts. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}
export function fmtPct(v: number | string | null | undefined, dp = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(dp)}%` : "—";
}
/** Signed percentage points, e.g. "-5.0 pp". */
export function fmtPp(v: number | string | null | undefined, dp = 1): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(dp)} pp` : "—";
}
export function fmtNum(v: number | string | null | undefined, dp = 0): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";
}
export function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v} day${Math.abs(v) === 1 ? "" : "s"}`;
}
export function fmtMoney(v: number | string | null | undefined, currency: string): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("en-IN")}`;
  }
}
export const CATEGORY_LABELS: Record<string, string> = {
  labor_shortage: "Labour shortage",
  equipment_breakdown: "Equipment breakdown",
  material_supply_delay: "Material supply delay",
  weather: "Weather",
  design_change: "Design changes",
  rework_quality: "Rework / quality issues",
  permits_approvals: "Permits or approvals",
  site_access: "Site access restrictions",
  contractor_coordination: "Contractor coordination",
  other_unknown: "Other / unknown",
};
export const HEALTH_LABELS: Record<string, string> = { on_track: "On track", at_risk: "At risk", delayed: "Delayed", unknown: "Not enough data" };
export const REPORT_STATUS_LABELS: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Returned" };
