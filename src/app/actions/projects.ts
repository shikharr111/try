"use server";
import { revalidatePath } from "next/cache";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { isUuid, requireManage, requireUser } from "@/lib/server/session";

const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;

function weekdays(formData: FormData): number[] {
  const out = formData.getAll("weekday").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(out)].sort();
}

function parseProject(formData: FormData) {
  const r = new FormReader(formData);
  const v = {
    code: r.text("code", "Project code", { required: true, max: 40 }),
    name: r.text("name", "Project name", { required: true, min: 2, max: 160 }),
    location: r.optionalText("location", "Location", 200),
    description: r.optionalText("description", "Description", 2000),
    construction_type: r.optionalText("construction_type", "Construction type", 80),
    planned_start: r.date("planned_start", "Planned start"),
    planned_finish: r.date("planned_finish", "Planned finish"),
    budget: r.decimal("budget", "Budget", { min: 0, max: 99999999999999 }),
    currency: r.text("currency", "Currency", { required: true, max: 3, min: 3 }).toUpperCase(),
    timezone: r.text("timezone", "Time zone", { required: true, max: 64 }),
    manager_id: r.uuid("manager_id", "Project manager", false),
    working_weekdays: weekdays(formData),
  };
  if (!/^[A-Z]{3}$/.test(v.currency)) r.errors.currency ??= "Currency must be a 3-letter code such as INR";
  if (v.planned_start && v.planned_finish && v.planned_finish < v.planned_start) r.errors.planned_finish = "Planned finish is before planned start";
  if (v.working_weekdays.length === 0) r.errors.weekday = "Choose at least one working day";
  try { new Intl.DateTimeFormat("en", { timeZone: v.timezone }); } catch { r.errors.timezone = "Unknown time zone"; }
  return { r, v };
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const orgId = new FormReader(formData).uuid("organization_id", "Organization");
  const { r, v } = parseProject(formData);
  if (!orgId) r.errors.organization_id = "Choose an organization";
  if (!r.ok) redirectWith("/projects/new", "err", Object.values(r.errors)[0]);
  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: orgId, created_by: user.id, ...v, budget: v.budget })
    .select("id")
    .single();
  if (error || !data) redirectWith("/projects/new", "err", friendlyDbError(error, "Could not create the project."));
  redirectWith(`/projects/${data.id}/plan`, "ok", "Project created. Start a baseline draft to add activities.");
}

export async function updateProject(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  if (!isUuid(id)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase } = await requireManage(id);
  const { r, v } = parseProject(formData);
  const status = new FormReader(formData).enumValue("status", "Status", STATUSES);
  if (!status) r.errors.status = "Choose a status";
  const back = `/projects/${id}/settings`;
  if (!r.ok) redirectWith(back, "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("projects").update({ ...v, status }).eq("id", id);
  if (error) redirectWith(back, "err", friendlyDbError(error));
  revalidatePath(`/projects/${id}`, "layout");
  redirectWith(back, "ok", "Project updated.");
}

export async function addHoliday(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  if (!isUuid(id)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase } = await requireManage(id);
  const r = new FormReader(formData);
  const date = r.date("holiday_date", "Date");
  const name = r.optionalText("name", "Name", 120);
  const back = `/projects/${id}/settings`;
  if (!r.ok) redirectWith(back, "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("project_holidays").upsert({ project_id: id, holiday_date: date, name });
  if (error) redirectWith(back, "err", friendlyDbError(error));
  redirectWith(back, "ok", "Holiday saved. Forecasts and planned progress use it from now on.");
}

export async function removeHoliday(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  const date = String(formData.get("holiday_date") ?? "");
  if (!isUuid(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase } = await requireManage(id);
  const { error } = await supabase.from("project_holidays").delete().eq("project_id", id).eq("holiday_date", date);
  redirectWith(`/projects/${id}/settings`, error ? "err" : "ok", error ? friendlyDbError(error) : "Holiday removed.");
}

export async function addProjectMember(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  if (!isUuid(id)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase } = await requireManage(id);
  const r = new FormReader(formData);
  const userId = r.uuid("user_id", "Person");
  const role = r.enumValue("role", "Role", ["project_manager", "site_engineer"] as const);
  const back = `/projects/${id}/settings`;
  if (!r.ok) redirectWith(back, "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("project_memberships").upsert({ project_id: id, user_id: userId, role }, { onConflict: "project_id,user_id" });
  redirectWith(back, error ? "err" : "ok", error ? friendlyDbError(error, "Could not add the member (they must belong to the organization).") : "Member saved.");
}

export async function removeProjectMember(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  const mid = String(formData.get("membership_id") ?? "");
  if (!isUuid(id) || !isUuid(mid)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase } = await requireManage(id);
  const { error } = await supabase.from("project_memberships").delete().eq("id", mid).eq("project_id", id);
  redirectWith(`/projects/${id}/settings`, error ? "err" : "ok", error ? friendlyDbError(error) : "Member removed.");
}

export async function addMilestone(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  if (!isUuid(id)) redirectWith("/projects", "err", "Invalid project.");
  const { supabase } = await requireManage(id);
  const r = new FormReader(formData);
  const name = r.text("name", "Milestone", { required: true, max: 160 });
  const target = r.date("target_date", "Target date");
  const back = `/projects/${id}/plan`;
  if (!r.ok) redirectWith(back, "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("milestones").insert({ project_id: id, name, target_date: target });
  redirectWith(back, error ? "err" : "ok", error ? friendlyDbError(error) : "Milestone added.");
}

export async function setMilestoneStatus(formData: FormData) {
  const id = String(formData.get("project_id") ?? "");
  const mid = String(formData.get("milestone_id") ?? "");
  if (!isUuid(id) || !isUuid(mid)) redirectWith("/projects", "err", "Invalid request.");
  const { supabase } = await requireManage(id);
  const r = new FormReader(formData);
  const status = r.enumValue("status", "Status", ["pending", "achieved", "missed"] as const);
  const achieved = r.date("achieved_date", "Achieved date", false);
  const back = `/projects/${id}/plan`;
  if (!status) redirectWith(back, "err", "Choose a status.");
  if (status === "achieved" && !achieved) redirectWith(back, "err", "Enter the date the milestone was achieved.");
  const { error } = await supabase.from("milestones").update({ status, achieved_date: status === "achieved" ? achieved : null }).eq("id", mid).eq("project_id", id);
  redirectWith(back, error ? "err" : "ok", error ? friendlyDbError(error) : "Milestone updated.");
}
