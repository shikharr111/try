"use server";
import { revalidatePath } from "next/cache";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { isUuid, requireManage } from "@/lib/server/session";
import { parseDailyPlan } from "@/lib/plan/daily-plan";

function ids(formData: FormData): { projectId: string; revisionId: string } {
  const projectId = String(formData.get("project_id") ?? "");
  const revisionId = String(formData.get("revision_id") ?? "");
  if (!isUuid(projectId)) redirectWith("/projects", "err", "Invalid project.");
  return { projectId, revisionId };
}
const back = (projectId: string) => `/projects/${projectId}/plan`;

/** Every action re-checks the caller's rights on the server: hidden buttons are not a security control. */
export async function startDraft(formData: FormData) {
  const { projectId } = ids(formData);
  const { supabase } = await requireManage(projectId);
  const reason = new FormReader(formData).optionalText("reason", "Reason", 500);
  const { error } = await supabase.rpc("create_baseline_draft", { p_project: projectId, p_reason: reason });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Draft revision started. Edit it, then approve it to make it the baseline.");
}

export async function discardDraft(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  if (!isUuid(revisionId)) redirectWith(back(projectId), "err", "Invalid revision.");
  const { supabase } = await requireManage(projectId);
  const { error } = await supabase.rpc("discard_baseline_draft", { p_revision: revisionId });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Draft discarded. The approved baseline is unchanged.");
}

export async function approveRevision(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  if (!isUuid(revisionId)) redirectWith(back(projectId), "err", "Invalid revision.");
  const { supabase } = await requireManage(projectId);
  const { error } = await supabase.from("baseline_revisions").update({ status: "approved" }).eq("id", revisionId).eq("project_id", projectId);
  if (error) redirectWith(back(projectId), "err", friendlyDbError(error));
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId), "ok", "Baseline approved. It is now immutable; later changes need a new revision.");
}

export async function addActivity(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  if (!isUuid(revisionId)) redirectWith(back(projectId), "err", "Invalid revision.");
  const { supabase } = await requireManage(projectId);
  const r = new FormReader(formData);
  const row = {
    code: r.text("code", "Activity code", { required: true, max: 40 }),
    name: r.text("name", "Activity name", { required: true, max: 200 }),
    unit: r.text("unit", "Unit", { required: true, max: 20 }),
    wbs_code: r.text("wbs_code", "WBS group", { max: 60 }),
    planned_start: r.date("planned_start", "Planned start"),
    planned_finish: r.date("planned_finish", "Planned finish"),
    total_qty: r.decimal("total_qty", "Total quantity", { required: true, min: 0 }),
    planned_workers: r.decimal("planned_workers", "Planned workers", { min: 0 }),
    planned_machine_hours: r.decimal("planned_machine_hours", "Planned machine-hours", { min: 0 }),
    weight: r.decimal("weight", "Weight", { min: 0 }),
  };
  if (row.planned_start && row.planned_finish && row.planned_finish < row.planned_start) r.errors.planned_finish = "Planned finish is before planned start";
  if (!r.ok) redirectWith(back(projectId), "err", Object.values(r.errors)[0]);
  const { error } = await supabase.rpc("import_activities", { p_project: projectId, p_revision: revisionId, p_rows: [row] });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : `Activity ${row.code} added to the draft.`);
}

export async function updateBaselineRow(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  const activityId = String(formData.get("activity_id") ?? "");
  if (!isUuid(revisionId) || !isUuid(activityId)) redirectWith(back(projectId), "err", "Invalid request.");
  const { supabase } = await requireManage(projectId);
  const r = new FormReader(formData);
  const start = r.date("planned_start", "Planned start");
  const finish = r.date("planned_finish", "Planned finish");
  const qty = r.decimal("total_qty", "Total quantity", { required: true, min: 0 });
  const workers = r.decimal("planned_workers", "Planned workers", { min: 0 });
  const mh = r.decimal("planned_machine_hours", "Planned machine-hours", { min: 0 });
  if (start && finish && finish < start) r.errors.planned_finish = "Planned finish is before planned start";
  if (!r.ok) redirectWith(back(projectId), "err", Object.values(r.errors)[0]);

  // Changing dates or quantity invalidates explicit daily targets (they must sum to the total), so revert to linear first.
  const { data: cur } = await supabase.from("baseline_activities").select("planned_start, planned_finish, total_qty, distribution").eq("revision_id", revisionId).eq("activity_id", activityId).maybeSingle();
  const changed = !cur || cur.planned_start !== start || cur.planned_finish !== finish || Number(cur.total_qty) !== Number(qty);
  let note = "Baseline row updated.";
  if (changed && cur?.distribution === "custom") {
    const { error: e1 } = await supabase.rpc("set_daily_plan", { p_revision: revisionId, p_activity: activityId, p_rows: [] });
    if (e1) redirectWith(back(projectId), "err", friendlyDbError(e1));
    note = "Baseline row updated. Its custom daily targets were cleared because dates or quantity changed.";
  }
  const { error } = await supabase.from("baseline_activities").update({ planned_start: start, planned_finish: finish, total_qty: qty, planned_workers: workers, planned_machine_hours: mh }).eq("revision_id", revisionId).eq("activity_id", activityId);
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : note);
}

export async function removeBaselineRow(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  const activityId = String(formData.get("activity_id") ?? "");
  if (!isUuid(revisionId) || !isUuid(activityId)) redirectWith(back(projectId), "err", "Invalid request.");
  const { supabase } = await requireManage(projectId);
  await supabase.from("activity_dependencies").delete().eq("revision_id", revisionId).or(`predecessor_id.eq.${activityId},successor_id.eq.${activityId}`);
  await supabase.from("daily_plans").delete().eq("revision_id", revisionId).eq("activity_id", activityId);
  const { error } = await supabase.from("baseline_activities").delete().eq("revision_id", revisionId).eq("activity_id", activityId);
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Activity removed from the draft (its reports, if any, are kept).");
}

export async function addDependency(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  if (!isUuid(revisionId)) redirectWith(back(projectId), "err", "Invalid revision.");
  const { supabase } = await requireManage(projectId);
  const r = new FormReader(formData);
  const pred = r.uuid("predecessor_id", "Predecessor");
  const succ = r.uuid("successor_id", "Successor");
  const lag = r.int("lag_working_days", "Lag", { min: -365, max: 365 }) ?? 0;
  if (pred && pred === succ) r.errors.successor_id = "An activity cannot depend on itself";
  if (!r.ok) redirectWith(back(projectId), "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("activity_dependencies").insert({ revision_id: revisionId, project_id: projectId, predecessor_id: pred, successor_id: succ, lag_working_days: lag });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Dependency added (finish-to-start).");
}

export async function removeDependency(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  const depId = String(formData.get("dependency_id") ?? "");
  if (!isUuid(revisionId) || !isUuid(depId)) redirectWith(back(projectId), "err", "Invalid request.");
  const { supabase } = await requireManage(projectId);
  const { error } = await supabase.from("activity_dependencies").delete().eq("id", depId).eq("revision_id", revisionId);
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Dependency removed.");
}

export async function saveDailyTargets(formData: FormData) {
  const { projectId, revisionId } = ids(formData);
  const activityId = String(formData.get("activity_id") ?? "");
  if (!isUuid(revisionId) || !isUuid(activityId)) redirectWith(back(projectId), "err", "Invalid request.");
  const { supabase } = await requireManage(projectId);
  const { data: row } = await supabase.from("baseline_activities").select("planned_start, planned_finish, total_qty").eq("revision_id", revisionId).eq("activity_id", activityId).maybeSingle();
  if (!row) redirectWith(back(projectId), "err", "Activity not found in this draft.");
  const text = String(formData.get("targets") ?? "").slice(0, 200_000);
  const parsed = parseDailyPlan(text, { start: row.planned_start, finish: row.planned_finish }, String(row.total_qty));
  if (!parsed.ok) redirectWith(back(projectId), "err", parsed.errors.slice(0, 3).join(" "));
  const { error } = await supabase.rpc("set_daily_plan", { p_revision: revisionId, p_activity: activityId, p_rows: parsed.rows });
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : parsed.rows.length ? "Custom daily targets saved." : "Reverted to linear distribution.");
}
