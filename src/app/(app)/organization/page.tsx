import { addOrgMember, changeOrgMemberRole, removeOrgMember } from "@/app/actions/org";
import { ConfirmForm } from "@/components/confirm-form";
import { Card, Field, Flash, Input, PageHeader, Select, TableWrap, Alert } from "@/components/ui";
import { getMemberships, requireUser } from "@/lib/server/session";

export const metadata = { title: "Organization" };
export const dynamic = "force-dynamic";
const ROLE_LABEL: Record<string, string> = { org_admin: "Organization admin", project_manager: "Project manager", site_engineer: "Site engineer" };

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const admin = (await getMemberships(supabase, user.id)).filter((m) => m.role === "org_admin");
  return (
    <>
      <PageHeader title="Organization" subtitle="People and roles. Project access is granted per project in each project's settings." />
      <Flash ok={sp.ok} err={sp.err} />
      {admin.length === 0 && <Alert tone="warn">Only organization admins can manage members.</Alert>}
      {await Promise.all(admin.map(async (m) => {
        const { data } = await supabase.from("organization_memberships").select("id, role, user_id, profiles:user_id(full_name, email)").eq("organization_id", m.organization_id).order("created_at");
        const rows = (data ?? []) as unknown as { id: string; role: string; user_id: string; profiles: { full_name: string | null; email: string | null } | null }[];
        return (
          <div key={m.organization_id} className="mb-6 space-y-4">
            <Card title={m.organization.name} padded={false}>
              <TableWrap>
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.profiles?.full_name ?? "—"}{r.user_id === user.id && " (you)"}</td>
                        <td>{r.profiles?.email ?? "—"}</td>
                        <td>
                          <form action={changeOrgMemberRole} className="flex items-center gap-2">
                            <input type="hidden" name="membership_id" value={r.id} />
                            <select name="role" defaultValue={r.role} className="input !min-h-[34px] !py-1" aria-label={`Role of ${r.profiles?.full_name ?? "member"}`}>
                              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <button className="btn btn-secondary !min-h-[34px] !py-1" type="submit">Save</button>
                          </form>
                        </td>
                        <td className="text-right">
                          <ConfirmForm action={removeOrgMember} fields={{ membership_id: r.id }} label="Remove" title="Remove this member?" danger confirmLabel="Remove"
                            message="They lose access to every project in this organization. Their past reports and entries are kept." />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
            <Card title="Add a member">
              <form action={addOrgMember} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="organization_id" value={m.organization_id} />
                <div className="sm:col-span-2"><Field label="Email of a registered user" name={`email-${m.organization_id}`}><Input name="email" type="email" required /></Field></div>
                <Field label="Role" name={`role-${m.organization_id}`}><Select name="role" defaultValue="site_engineer">{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <div className="flex items-end"><button className="btn btn-primary" type="submit">Add</button></div>
              </form>
              <p className="mt-2 text-xs text-ink-mute">The person must have signed up already. Adding someone reveals to you whether that exact email has an account.</p>
            </Card>
          </div>
        );
      }))}
    </>
  );
}
