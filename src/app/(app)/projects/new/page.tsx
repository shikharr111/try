import { redirect } from "next/navigation";
import { createProject } from "@/app/actions/projects";
import { ProjectFields } from "@/components/project-form";
import { Card, Flash, PageHeader, Field, Select } from "@/components/ui";
import { getMemberships, requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const orgs = (await getMemberships(supabase, user.id)).filter((m) => m.role !== "site_engineer");
  if (orgs.length === 0) redirect("/projects?err=" + encodeURIComponent("Only project managers and organization admins can create projects."));
  const { data: members } = await supabase
    .from("organization_memberships")
    .select("user_id, role, profiles:user_id(full_name, email)")
    .in("organization_id", orgs.map((o) => o.organization_id))
    .in("role", ["org_admin", "project_manager"]);
  const managers = ((members ?? []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[]).map((m) => ({
    id: m.user_id,
    name: m.profiles?.full_name || m.profiles?.email || m.user_id,
  }));
  return (
    <>
      <PageHeader title="New project" subtitle="After creating the project you can build and approve the baseline schedule." />
      <Flash err={sp.err} />
      <form action={createProject}>
        <Card className="max-w-4xl">
          <div className="mb-4">
            <Field label="Organization" name="organization_id" required>
              <Select name="organization_id" required defaultValue={orgs[0].organization_id}>
                {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization.name}</option>)}
              </Select>
            </Field>
          </div>
          <ProjectFields managers={managers} />
          <div className="mt-5 flex gap-2"><button className="btn btn-primary" type="submit">Create project</button></div>
        </Card>
      </form>
    </>
  );
}
