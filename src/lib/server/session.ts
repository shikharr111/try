import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { projectAccess, type OrgRole, type ProjectRole } from "../permissions";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | undefined | null): s is string => !!s && UUID.test(s);

export async function requireUser() {
  const supabase = await createClient();
  // getUser() validates the JWT with the Supabase auth server; never trust an unverified session.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

export interface OrgMembership {
  organization_id: string;
  role: OrgRole;
  organization: { id: string; name: string; slug: string; is_demo: boolean };
}

export async function getMemberships(supabase: Supabase, userId: string): Promise<OrgMembership[]> {
  const { data } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organization:organizations(id, name, slug, is_demo)")
    .eq("user_id", userId);
  return ((data ?? []) as unknown as OrgMembership[]).filter((m) => m.organization);
}

export interface ProjectRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  construction_type: string | null;
  planned_start: string;
  planned_finish: string;
  budget: number | string | null;
  currency: string;
  status: string;
  manager_id: string | null;
  working_weekdays: number[];
  timezone: string;
  is_demo: boolean;
}

export const getProjectContext = cache(async (projectId: string) => {
  if (!isUuid(projectId)) notFound();
  const { supabase, user } = await requireUser();
  // RLS returns nothing for projects the user cannot read, so a guessed id is indistinguishable from a missing one.
  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) notFound();
  const p = project as unknown as ProjectRow;
  const [{ data: org }, { data: pm }] = await Promise.all([
    supabase.from("organization_memberships").select("role").eq("organization_id", p.organization_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("project_memberships").select("role").eq("project_id", p.id).eq("user_id", user.id).maybeSingle(),
  ]);
  const orgRole = (org?.role ?? null) as OrgRole | null;
  const projectRole = (pm?.role ?? null) as ProjectRole | null;
  return { supabase, user, project: p, orgRole, projectRole, access: projectAccess(orgRole, projectRole) };
});

export type ProjectContext = Awaited<ReturnType<typeof getProjectContext>>;

/** Server actions re-check authorization themselves: UI hiding is not a security control. */
export async function requireManage(projectId: string) {
  const ctx = await getProjectContext(projectId);
  if (!ctx.access.manage) throw new Error("FORBIDDEN");
  return ctx;
}
