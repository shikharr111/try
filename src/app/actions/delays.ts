"use server";
import { revalidatePath } from "next/cache";
import { DELAY_CATEGORIES } from "@/lib/ai/schema";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { getProjectContext, isUuid } from "@/lib/server/session";

/**
 * Delay events record WHAT happened, never who is to blame (the table has no responsible-party column).
 * Authorization is enforced by RLS + delay_event_guard; the checks here only give friendlier messages.
 */
const back = (p: string) => `/projects/${p}/delays`;

export async function createDelay(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  if (!isUuid(projectId)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase, user, access } = await getProjectContext(projectId);
  if (!access.report) redirectWith(back(projectId), "err", "You do not have permission to log delays.");
  const r = new FormReader(formData);
  const category = r.enumValue("category", "Reason", DELAY_CATEGORIES);
  const start = r.date("start_date", "Start date");
  const end = r.date("end_date", "End date");
  const duration = r.decimal("duration_working_days", "Working days lost", { min: 0, max: 9999 });
  const description = r.text("description", "Description", { required: true, max: 1000 });
  const evidence = r.optionalText("evidence", "Evidence", 1000);
  const activity = r.uuid("activity_id", "Activity", false);
  if (start && end && end < start) r.errors.end_date = "End date is before start date";
  if (!r.ok) redirectWith(back(projectId), "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("delay_events").insert({
    project_id: projectId, activity_id: activity, category, start_date: start, end_date: end, duration_working_days: duration,
    description, evidence, created_by: user.id,
  });
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Delay event logged. A manager will review it.");
}

export async function reviewDelay(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const id = String(formData.get("delay_id") ?? "");
  if (!isUuid(projectId) || !isUuid(id)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase, access } = await getProjectContext(projectId);
  if (!access.review) redirectWith(back(projectId), "err", "Only a project manager or organization admin can review delay events.");
  const r = new FormReader(formData);
  const status = r.enumValue("status", "Decision", ["confirmed", "dismissed", "unreviewed"] as const);
  const comment = r.optionalText("comment", "Comment", 1000);
  if (!status) redirectWith(back(projectId), "err", "Choose a decision.");
  if (status === "dismissed" && !comment) redirectWith(back(projectId), "err", "Say briefly why the event is dismissed.");
  const { error } = await supabase.from("delay_events").update({ review_status: status, review_comment: comment }).eq("id", id).eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Delay event updated.");
}

export async function deleteDelay(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const id = String(formData.get("delay_id") ?? "");
  if (!isUuid(projectId) || !isUuid(id)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase } = await getProjectContext(projectId);
  const { error, count } = await supabase.from("delay_events").delete({ count: "exact" }).eq("id", id).eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId), error ? "err" : count === 0 ? "err" : "ok", error ? friendlyDbError(error) : count === 0 ? "That event cannot be deleted (it may already be reviewed)." : "Delay event deleted.");
}
