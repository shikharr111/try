import type { AnalysisResult, RecommendedAction } from "./schema";
import { resolveRef, type MetricSnapshot } from "./snapshot";

/**
 * Post-validation checks that tie the model's claims back to the data it was given.
 * The model may not (a) cite metrics that do not exist, (b) call something "confirmed" without a confirmed
 * delay event, (c) reference unknown activities, or (d) invent dates/costs. Violations are corrected
 * conservatively (downgrade / drop / flag) and always reported in `warnings`; nothing is silently trusted.
 */

export interface ReconcileOutcome {
  value: AnalysisResult;
  warnings: string[];
}

type SnapshotLike = Pick<MetricSnapshot, "activities" | "delay_events" | "project"> & Record<string, unknown>;

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const MONEY = /(?:[$€£₹]\s?\d|\b(?:rs\.?|inr|usd|eur|gbp)\s?\d|\b\d[\d,.]*\s?(?:lakh|crore|k|m|million|bn)\b)/i;

function collectSnapshotDates(snapshot: unknown, into: Set<string>) {
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.match(ISO_DATE) ?? []) into.add(m);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object" && v !== null) Object.values(v).forEach(walk);
  };
  walk(snapshot);
}

export function reconcile(value: AnalysisResult, snapshot: SnapshotLike): ReconcileOutcome {
  const warnings: string[] = [];
  const known = new Set(Object.keys(snapshot.activities));
  const confirmedEvents = new Map(snapshot.delay_events.filter((e) => e.review_status === "confirmed").map((e) => [e.id, e]));
  const snapshotDates = new Set<string>();
  collectSnapshotDates(snapshot, snapshotDates);

  const checkRefs = (refs: string[], where: string): string[] => {
    const good: string[] = [];
    for (const r of refs) {
      if (resolveRef(snapshot, r).found) good.push(r);
      else warnings.push(`${where}: evidence reference "${r}" does not exist in the metric snapshot and was removed`);
    }
    return good;
  };
  const checkCode = (code: string | null, where: string): string | null => {
    if (code === null) return null;
    if (known.has(code)) return code;
    warnings.push(`${where}: unknown activity code "${code}" was removed`);
    return null;
  };
  const checkText = (text: string, where: string) => {
    for (const d of text.match(ISO_DATE) ?? []) {
      if (!snapshotDates.has(d)) warnings.push(`${where}: mentions date ${d}, which is not in the supplied data; treat it as unverified`);
    }
  };

  const delayed = value.delayed_activities
    .filter((d) => {
      const ok = known.has(d.activity_code);
      if (!ok) warnings.push(`delayed_activities: unknown activity code "${d.activity_code}" was dropped`);
      return ok;
    });

  const findings = value.findings.map((f, i) => {
    const refs = checkRefs(f.evidence_refs, `findings[${i}]`);
    if (refs.length === 0) warnings.push(`findings[${i}]: no valid evidence reference; shown as unsupported`);
    checkText(f.statement, `findings[${i}]`);
    return { ...f, evidence_refs: refs };
  });

  const causes = value.causes.map((c, i) => {
    const where = `causes[${i}]`;
    const code = checkCode(c.activity_code, where);
    const refs = checkRefs(c.evidence_refs, where);
    let { status, confidence } = c;
    let eventId = c.delay_event_id;
    if (eventId !== null && !snapshot.delay_events.some((e) => e.id === eventId)) {
      warnings.push(`${where}: delay_event_id does not exist in the data and was removed`);
      eventId = null;
    }
    if (status === "confirmed") {
      const ev = eventId ? confirmedEvents.get(eventId) : undefined;
      if (!ev) {
        warnings.push(`${where}: marked "confirmed" without a confirmed delay event; downgraded to hypothesis`);
        status = "hypothesis";
      } else if (ev.category !== c.category) {
        warnings.push(`${where}: category differs from the confirmed delay event's category; downgraded to hypothesis`);
        status = "hypothesis";
      }
    }
    if (status === "hypothesis" && confidence === "high") {
      warnings.push(`${where}: a hypothesis cannot carry high confidence; lowered to medium`);
      confidence = "medium";
    }
    if (status === "hypothesis" && refs.length === 0 && confidence !== "low") {
      warnings.push(`${where}: hypothesis has no valid evidence; confidence lowered to low`);
      confidence = "low";
    }
    checkText(c.description, where);
    return { ...c, activity_code: code, evidence_refs: refs, delay_event_id: eventId, status, confidence };
  });

  const actions: RecommendedAction[] = value.recommended_actions.map((a, i) => {
    const where = `recommended_actions[${i}]`;
    const code = checkCode(a.target_activity_code, where);
    let cost = a.cost_implications;
    if (cost.basis === "provided_data") {
      warnings.push(`${where}: claims cost data was provided, but none is; reset to "none_provided"`);
      cost = { ...cost, basis: "none_provided" };
    }
    if (MONEY.test(cost.summary) || MONEY.test(a.description)) {
      warnings.push(`${where}: contains a monetary figure that is not derived from supplied data; cost figures must be treated as unverified`);
    }
    for (const t of [a.description, a.expected_schedule_benefit.basis, ...a.assumptions]) checkText(t, where);
    if (a.expected_schedule_benefit.working_days !== null && a.assumptions.length === 0) {
      warnings.push(`${where}: schedule benefit is stated without assumptions; treat as unverified`);
    }
    return { ...a, target_activity_code: code, cost_implications: cost };
  });

  checkText(value.executive_summary, "executive_summary");
  return {
    value: { ...value, delayed_activities: delayed, findings, causes, recommended_actions: actions },
    warnings,
  };
}
