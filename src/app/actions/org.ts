"use server";
import { redirect } from "next/navigation";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { isUuid, requireUser } from "@/lib/server/session";

export async function createOrganization(formData: FormData) {
  const { supabase } = await requireUser();
  const r = new FormReader(formData);
  const name = r.text("name", "Organization name", { required: true, min: 2, max: 120 });
  if (!r.ok) redirectWith("/onboarding", "err", Object.values(r.errors)[0]);
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) redirectWith("/onboarding", "err", friendlyDbError(error, "Could not create the organization."));
  redirect("/dashboard");
}

const ROLES = ["org_admin", "project_manager", "site_engineer"] as const;

export async function addOrgMember(formData: FormData) {
  const { supabase } = await requireUser();
  const r = new FormReader(formData);
  const org = r.uuid("organization_id", "Organization");
  const email = r.email("email");
  const role = r.enumValue("role", "Role", ROLES);
  if (!r.ok || !org || !role) redirectWith("/organization", "err", Object.values(r.errors)[0] ?? "Invalid input.");
  const { error } = await supabase.rpc("add_org_member_by_email", { p_org: org, p_email: email, p_role: role });
  if (error) redirectWith("/organization", "err", friendlyDbError(error));
  redirectWith("/organization", "ok", "Member added.");
}

export async function changeOrgMemberRole(formData: FormData) {
  const { supabase } = await requireUser();
  const r = new FormReader(formData);
  const id = r.uuid("membership_id", "Member");
  const role = r.enumValue("role", "Role", ROLES);
  if (!r.ok || !id || !role) redirectWith("/organization", "err", "Invalid input.");
  const { error } = await supabase.from("organization_memberships").update({ role }).eq("id", id);
  if (error) redirectWith("/organization", "err", friendlyDbError(error));
  redirectWith("/organization", "ok", "Role updated.");
}

export async function removeOrgMember(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("membership_id") ?? "");
  if (!isUuid(id)) redirectWith("/organization", "err", "Invalid input.");
  const { error } = await supabase.from("organization_memberships").delete().eq("id", id);
  if (error) redirectWith("/organization", "err", friendlyDbError(error));
  redirectWith("/organization", "ok", "Member removed.");
}
