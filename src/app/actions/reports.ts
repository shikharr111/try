"use server";
import { revalidatePath } from "next/cache";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, safeFileName } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { getProjectContext, isUuid } from "@/lib/server/session";
import { parseReportPayload } from "@/lib/reports/payload";
import { reportActions, type ReportStatus } from "@/lib/permissions";

/** UNVERIFIED against a live Supabase project (the DB functions called here ARE covered by supabase/tests). */
export interface SaveState { errors?: string[] }

const back = (p: string, r?: string) => `/projects/${p}/reports${r ? `/${r}` : ""}`;

/**
 * Saves a daily report. The client sends one JSON payload; it is re-validated here and again by the database
 * (save_daily_report is SECURITY INVOKER, so RLS and triggers decide who may do what).
 */
export async function saveReport(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const projectId = String(formData.get("project_id") ?? "");
  const reportIdRaw = String(formData.get("report_id") ?? "");
  if (!isUuid(projectId)) return { errors: ["Invalid project."] };
  if (reportIdRaw && !isUuid(reportIdRaw)) return { errors: ["Invalid report."] };
  const submit = formData.get("intent") === "submit";
  const { supabase, access } = await getProjectContext(projectId);
  if (!access.report) return { errors: ["You do not have permission to report on this project."] };

  let raw: unknown;
  try {
    const s = String(formData.get("payload") ?? "");
    if (s.length > 1_000_000) return { errors: ["The report is too large."] };
    raw = JSON.parse(s);
  } catch {
    return { errors: ["The form data could not be read. Reload the page and try again."] };
  }
  const { data: acts } = await supabase.from("activities").select("id").eq("project_id", projectId).limit(5000);
  const parsed = parseReportPayload(raw, { activityIds: new Set((acts ?? []).map((a) => a.id as string)) });
  if (!parsed.ok) return { errors: parsed.errors };
  const v = parsed.value;

  const { data: id, error } = await supabase.rpc("save_daily_report", {
    p_project: projectId, p_report_id: reportIdRaw || null, p_header: v.header,
    p_lines: v.lines, p_workforce: v.workforce, p_equipment: v.equipment, p_submit: submit,
  });
  if (error || !id) return { errors: [friendlyDbError(error)] };

  // Delay events logged with this report are new events (existing ones are managed on the Delay events page).
  let note = "";
  if (v.delays.length > 0) {
    const { data: u } = await supabase.auth.getUser();
    const rows = v.delays.map((d) => ({
      project_id: projectId, report_id: id as string, activity_id: d.activity_id, category: d.category,
      start_date: v.header.report_date, end_date: v.header.report_date, duration_working_days: d.duration_working_days,
      description: d.description, created_by: u.user!.id,
    }));
    const { error: de } = await supabase.from("delay_events").insert(rows);
    if (de) note = ` The report was saved, but delay events were not: ${friendlyDbError(de)}`;
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId, id as string), note ? "err" : "ok", note ? note.trim() : submit ? "Report submitted for review." : "Draft saved.");
}

async function loadReport(projectId: string, reportId: string) {
  if (!isUuid(projectId) || !isUuid(reportId)) redirectWith("/projects", "err", "Invalid request.");
  const ctx = await getProjectContext(projectId);
  const { data: r } = await ctx.supabase.from("daily_reports").select("id, status, reporter_id").eq("id", reportId).eq("project_id", projectId).maybeSingle();
  if (!r) redirectWith(back(projectId), "err", "Report not found.");
  const can = reportActions({ status: r.status as ReportStatus, isReporter: r.reporter_id === ctx.user.id, access: ctx.access });
  return { ...ctx, report: r, can };
}

async function transition(formData: FormData, to: "submitted" | "draft" | "approved" | "rejected", ok: string) {
  const projectId = String(formData.get("project_id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  const { supabase, can } = await loadReport(projectId, reportId);
  const allowed = to === "submitted" ? can.submit : to === "draft" ? can.recall : to === "approved" ? can.approve : can.reject;
  if (!allowed) redirectWith(back(projectId, reportId), "err", "That action is not available for this report.");
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null;
  if (to === "rejected" && !comment) redirectWith(back(projectId, reportId), "err", "Add a comment explaining what needs to change.");
  const patch: Record<string, unknown> = { status: to };
  if (to === "approved" || to === "rejected") patch.review_comment = comment;
  const { error } = await supabase.from("daily_reports").update(patch).eq("id", reportId).eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId, reportId), error ? "err" : "ok", error ? friendlyDbError(error) : ok);
}
export async function submitReport(formData: FormData) { return transition(formData, "submitted", "Report submitted for review."); }
export async function recallReport(formData: FormData) { return transition(formData, "draft", "Report recalled to draft."); }
export async function approveReport(formData: FormData) { return transition(formData, "approved", "Report approved. Its quantities now count as approved progress."); }
export async function rejectReport(formData: FormData) { return transition(formData, "rejected", "Report returned to the reporter."); }

export async function deleteReport(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  const { supabase, can } = await loadReport(projectId, reportId);
  if (!can.delete) redirectWith(back(projectId, reportId), "err", "Only draft or returned reports can be deleted.");
  const { error } = await supabase.from("daily_reports").delete().eq("id", reportId).eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`, "layout");
  redirectWith(back(projectId), error ? "err" : "ok", error ? friendlyDbError(error) : "Report deleted.");
}

/** Attachments: validated type/size, stored under <project_id>/ in the private bucket with the user's own session. */
export async function uploadAttachment(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  const { supabase, user, report } = await loadReport(projectId, reportId);
  const file = formData.get("file");
  const here = back(projectId, reportId);
  if (!(file instanceof File) || file.size === 0) redirectWith(here, "err", "Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) redirectWith(here, "err", `File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) redirectWith(here, "err", "Only JPEG, PNG, WebP images and PDF files are allowed.");
  if (report.status === "approved") redirectWith(here, "err", "Approved reports are locked.");
  const name = safeFileName(file.name);
  const path = `${projectId}/${crypto.randomUUID()}-${name}`;
  const up = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) redirectWith(here, "err", "The file could not be uploaded.");
  const { error } = await supabase.from("attachments").insert({ project_id: projectId, report_id: reportId, storage_path: path, file_name: name, mime_type: file.type, size_bytes: file.size, uploaded_by: user.id });
  if (error) {
    await supabase.storage.from("attachments").remove([path]); // do not leave an orphaned object
    redirectWith(here, "err", friendlyDbError(error));
  }
  redirectWith(here, "ok", "Attachment uploaded.");
}

export async function deleteAttachment(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const reportId = String(formData.get("report_id") ?? "");
  const attId = String(formData.get("attachment_id") ?? "");
  const { supabase, report } = await loadReport(projectId, reportId);
  const here = back(projectId, reportId);
  if (!isUuid(attId)) redirectWith(here, "err", "Invalid attachment.");
  if (report.status === "approved") redirectWith(here, "err", "Approved reports are locked.");
  const { data: a } = await supabase.from("attachments").select("storage_path").eq("id", attId).eq("report_id", reportId).maybeSingle();
  if (!a) redirectWith(here, "err", "Attachment not found.");
  const { error } = await supabase.from("attachments").delete().eq("id", attId);
  if (error) redirectWith(here, "err", friendlyDbError(error));
  await supabase.storage.from("attachments").remove([a.storage_path as string]);
  redirectWith(here, "ok", "Attachment removed.");
}
