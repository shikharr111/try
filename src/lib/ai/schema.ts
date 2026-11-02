/**
 * Strict, dependency-free validator for the structured analysis the LLM must return.
 * The model explains deterministic numbers; it never produces authoritative KPIs. Anything it returns
 * is validated here, then reconciled against the metric snapshot (see reconcile.ts) before being stored.
 */

export const PROMPT_VERSION = "delay-analysis-v1";

export const DELAY_CATEGORIES = [
  "labor_shortage", "equipment_breakdown", "material_supply_delay", "weather", "design_change",
  "rework_quality", "permits_approvals", "site_access", "contractor_coordination", "other_unknown",
] as const;
export type DelayCategoryId = (typeof DELAY_CATEGORIES)[number];

export const ACTION_TYPES = [
  "add_workers", "add_equipment", "extend_hours", "resequence", "resolve_material", "resolve_permit", "investigate", "other",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type Confidence = "high" | "medium" | "low";

export interface Finding {
  id: string;
  statement: string;
  /** Paths into the metric snapshot supporting the statement, e.g. "activities.FND.progress.progress_variance_pp" */
  evidence_refs: string[];
}
export interface Cause {
  activity_code: string | null;
  description: string;
  category: DelayCategoryId;
  status: "confirmed" | "hypothesis";
  confidence: Confidence;
  evidence_refs: string[];
  /** Must be the id of a CONFIRMED delay event in the snapshot when status = "confirmed" */
  delay_event_id: string | null;
}
export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  target_activity_code: string | null;
  action_type: ActionType;
  resource_requirements: {
    additional_workers: number | null;
    additional_machines: { type: string; count: number }[];
    works_on_non_working_days: boolean;
    starts_before_predecessor_complete: boolean;
  };
  expected_schedule_benefit: { working_days: number | null; basis: string };
  assumptions: string[];
  cost_implications: { summary: string; basis: "none_provided" | "provided_data" };
  risks_tradeoffs: string[];
  requires_human_approval: true;
}
export interface AnalysisResult {
  executive_summary: string;
  overall_assessment: "on_track" | "at_risk" | "delayed" | "uncertain";
  delayed_activities: { activity_code: string; status: "delayed" | "at_risk"; summary: string }[];
  findings: Finding[];
  causes: Cause[];
  missing_information: { item: string; why_it_matters: string }[];
  recommended_actions: RecommendedAction[];
  follow_up_questions: string[];
  limitations: string[];
}

export type ValidationOutcome = { ok: true; value: AnalysisResult } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

class Collector {
  errors: string[] = [];
  err(path: string, msg: string) {
    if (this.errors.length < 40) this.errors.push(`${path}: ${msg}`);
  }
  str(o: Record<string, unknown>, k: string, path: string, opts: { max?: number; allowEmpty?: boolean } = {}): string {
    const v = o[k];
    if (typeof v !== "string") { this.err(`${path}.${k}`, "must be a string"); return ""; }
    if (!opts.allowEmpty && v.trim() === "") this.err(`${path}.${k}`, "must not be empty");
    if (v.length > (opts.max ?? 4000)) this.err(`${path}.${k}`, `longer than ${opts.max ?? 4000} characters`);
    return v;
  }
  nullableStr(o: Record<string, unknown>, k: string, path: string): string | null {
    const v = o[k];
    if (v === null) return null;
    if (typeof v !== "string") { this.err(`${path}.${k}`, "must be a string or null"); return null; }
    return v;
  }
  oneOf<T extends string>(o: Record<string, unknown>, k: string, allowed: readonly T[], path: string): T {
    const v = o[k];
    if (typeof v !== "string" || !allowed.includes(v as T)) { this.err(`${path}.${k}`, `must be one of ${allowed.join(" | ")}`); return allowed[0]; }
    return v as T;
  }
  arr(o: Record<string, unknown>, k: string, path: string, max = 50): unknown[] {
    const v = o[k];
    if (!Array.isArray(v)) { this.err(`${path}.${k}`, "must be an array"); return []; }
    if (v.length > max) this.err(`${path}.${k}`, `more than ${max} items`);
    return v.slice(0, max);
  }
  strArr(o: Record<string, unknown>, k: string, path: string, max = 30): string[] {
    const a = this.arr(o, k, path, max);
    return a.map((x, i) => {
      if (typeof x !== "string") { this.err(`${path}.${k}[${i}]`, "must be a string"); return ""; }
      return x;
    });
  }
  obj(v: unknown, path: string): Record<string, unknown> {
    if (!isObj(v)) { this.err(path, "must be an object"); return {}; }
    return v;
  }
}

export function validateAnalysis(raw: unknown): ValidationOutcome {
  const c = new Collector();
  const root = c.obj(raw, "$");
  const out: AnalysisResult = {
    executive_summary: c.str(root, "executive_summary", "$", { max: 3000 }),
    overall_assessment: c.oneOf(root, "overall_assessment", ["on_track", "at_risk", "delayed", "uncertain"] as const, "$"),
    delayed_activities: c.arr(root, "delayed_activities", "$").map((x, i) => {
      const p = `$.delayed_activities[${i}]`; const o = c.obj(x, p);
      return { activity_code: c.str(o, "activity_code", p, { max: 40 }), status: c.oneOf(o, "status", ["delayed", "at_risk"] as const, p), summary: c.str(o, "summary", p, { max: 1000 }) };
    }),
    findings: c.arr(root, "findings", "$").map((x, i) => {
      const p = `$.findings[${i}]`; const o = c.obj(x, p);
      return { id: c.str(o, "id", p, { max: 40 }), statement: c.str(o, "statement", p, { max: 1500 }), evidence_refs: c.strArr(o, "evidence_refs", p) };
    }),
    causes: c.arr(root, "causes", "$").map((x, i) => {
      const p = `$.causes[${i}]`; const o = c.obj(x, p);
      return {
        activity_code: c.nullableStr(o, "activity_code", p),
        description: c.str(o, "description", p, { max: 1500 }),
        category: c.oneOf(o, "category", DELAY_CATEGORIES, p),
        status: c.oneOf(o, "status", ["confirmed", "hypothesis"] as const, p),
        confidence: c.oneOf(o, "confidence", ["high", "medium", "low"] as const, p),
        evidence_refs: c.strArr(o, "evidence_refs", p),
        delay_event_id: c.nullableStr(o, "delay_event_id", p),
      };
    }),
    missing_information: c.arr(root, "missing_information", "$").map((x, i) => {
      const p = `$.missing_information[${i}]`; const o = c.obj(x, p);
      return { item: c.str(o, "item", p, { max: 500 }), why_it_matters: c.str(o, "why_it_matters", p, { max: 1000 }) };
    }),
    recommended_actions: c.arr(root, "recommended_actions", "$", 12).map((x, i) => {
      const p = `$.recommended_actions[${i}]`; const o = c.obj(x, p);
      const rr = c.obj(o.resource_requirements, `${p}.resource_requirements`);
      const sb = c.obj(o.expected_schedule_benefit, `${p}.expected_schedule_benefit`);
      const ci = c.obj(o.cost_implications, `${p}.cost_implications`);
      let workers: number | null = null;
      if (rr.additional_workers !== null) {
        if (typeof rr.additional_workers !== "number" || !Number.isFinite(rr.additional_workers) || rr.additional_workers < 0 || rr.additional_workers > 10_000) {
          c.err(`${p}.resource_requirements.additional_workers`, "must be null or a non-negative number");
        } else workers = rr.additional_workers;
      }
      const machines = c.arr(rr, "additional_machines", `${p}.resource_requirements`, 20).map((m, j) => {
        const mp = `${p}.resource_requirements.additional_machines[${j}]`; const mo = c.obj(m, mp);
        const count = mo.count;
        if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 1000) c.err(`${mp}.count`, "must be a non-negative integer");
        return { type: c.str(mo, "type", mp, { max: 80 }), count: typeof count === "number" ? count : 0 };
      });
      for (const flag of ["works_on_non_working_days", "starts_before_predecessor_complete"] as const) {
        if (typeof rr[flag] !== "boolean") c.err(`${p}.resource_requirements.${flag}`, "must be a boolean");
      }
      let benefit: number | null = null;
      if (sb.working_days !== null) {
        if (typeof sb.working_days !== "number" || !Number.isFinite(sb.working_days) || sb.working_days < 0 || sb.working_days > 3650) {
          c.err(`${p}.expected_schedule_benefit.working_days`, "must be null or a non-negative number");
        } else benefit = sb.working_days;
      }
      if (o.requires_human_approval !== true) c.err(`${p}.requires_human_approval`, "must be true: recommendations are advisory");
      return {
        id: c.str(o, "id", p, { max: 40 }),
        title: c.str(o, "title", p, { max: 200 }),
        description: c.str(o, "description", p, { max: 2000 }),
        target_activity_code: c.nullableStr(o, "target_activity_code", p),
        action_type: c.oneOf(o, "action_type", ACTION_TYPES, p),
        resource_requirements: {
          additional_workers: workers,
          additional_machines: machines,
          works_on_non_working_days: rr.works_on_non_working_days === true,
          starts_before_predecessor_complete: rr.starts_before_predecessor_complete === true,
        },
        expected_schedule_benefit: { working_days: benefit, basis: c.str(sb, "basis", `${p}.expected_schedule_benefit`, { max: 1000 }) },
        assumptions: c.strArr(o, "assumptions", p),
        cost_implications: { summary: c.str(ci, "summary", `${p}.cost_implications`, { max: 1000 }), basis: c.oneOf(ci, "basis", ["none_provided", "provided_data"] as const, `${p}.cost_implications`) },
        risks_tradeoffs: c.strArr(o, "risks_tradeoffs", p),
        requires_human_approval: true as const,
      };
    }),
    follow_up_questions: c.strArr(root, "follow_up_questions", "$"),
    limitations: c.strArr(root, "limitations", "$"),
  };
  return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, value: out };
}

/** Human-readable description of the required JSON shape, embedded in the prompt. */
export const OUTPUT_SHAPE = `{
  "executive_summary": string,
  "overall_assessment": "on_track" | "at_risk" | "delayed" | "uncertain",
  "delayed_activities": [{ "activity_code": string, "status": "delayed" | "at_risk", "summary": string }],
  "findings": [{ "id": string, "statement": string, "evidence_refs": [string] }],
  "causes": [{
    "activity_code": string | null, "description": string,
    "category": ${DELAY_CATEGORIES.map((c) => `"${c}"`).join(" | ")},
    "status": "confirmed" | "hypothesis", "confidence": "high" | "medium" | "low",
    "evidence_refs": [string], "delay_event_id": string | null
  }],
  "missing_information": [{ "item": string, "why_it_matters": string }],
  "recommended_actions": [{
    "id": string, "title": string, "description": string, "target_activity_code": string | null,
    "action_type": ${ACTION_TYPES.map((c) => `"${c}"`).join(" | ")},
    "resource_requirements": {
      "additional_workers": number | null,
      "additional_machines": [{ "type": string, "count": integer }],
      "works_on_non_working_days": boolean,
      "starts_before_predecessor_complete": boolean
    },
    "expected_schedule_benefit": { "working_days": number | null, "basis": string },
    "assumptions": [string],
    "cost_implications": { "summary": string, "basis": "none_provided" | "provided_data" },
    "risks_tradeoffs": [string],
    "requires_human_approval": true
  }],
  "follow_up_questions": [string],
  "limitations": [string]
}`;
