import { Alert, Card, Field, Flash, Input, PageHeader, Select, TableWrap } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { ProjectFields } from "@/components/project-form";
import { addHoliday, addProjectMember, removeHoliday, removeProjectMember, updateProject } from "@/app/actions/projects";
import { fmtDate } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";

export const dynamic = "force-dynamic";
const STATUS = ["planning", "active", "on_hold", "completed", "cancelled"];

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project, access } = await getProjectContext(projectId);

  const [{ data: holidays }, { data: members }, { data: orgMembers }, { data: audit }] = await Promise.all([
    supabase.from("project_holidays").select("holiday_date, name").eq("project_id", project.id).order("holiday_date"),
    supabase.from("project_memberships").select("id, user_id, role").eq("project_id", project.id),
    supabase.from("v_org_members").select("user_id, role, full_name, email").eq("organization_id", project.organization_id),
    access.viewAudit ? supabase.from("audit_logs").select("id, action, table_name, record_id, actor_id, created_at").eq("project_id", project.id).order("created_at", { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
  ]);
  const people = new Map((orgMembers ?? []).map((m) => [m.user_id as string, (m.full_name as string | null) || (m.email as string | null) || (m.user_id as string).slice(0, 8)]));
  const managers = (orgMembers ?? []).filter((m) => m.role !== "site_engineer").map((m) => ({ id: m.user_id as string, name: people.get(m.user_id as string)! }));
  const memberIds = new Set((members ?? []).map((m) => m.user_id));

  return (
    <>
      <PageHeader title="Settings & members" subtitle="Project details, working calendar, holidays and who can access this project." />
      <Flash ok={sp.ok} err={sp.err} />
      {!access.manage && <div className="mb-4"><Alert tone="info">You have read access. Only project managers and organization admins can change settings.</Alert></div>}

      {access.manage && (
        <form action={updateProject}>
          <input type="hidden" name="project_id" value={project.id} />
          <Card title="Project details">
            <ProjectFields project={project} managers={managers} />
            <div className="mt-4 max-w-xs"><Field label="Status" name="status"><Select name="status" defaultValue={project.status}>{STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></Field></div>
            <p className="mt-3 text-xs text-ink-mute">Changing working days or holidays changes planned progress and forecasts immediately (they are computed, not stored). The approved baseline dates themselves are not altered.</p>
            <button className="btn btn-primary mt-4">Save changes</button>
          </Card>
        </form>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Holidays" padded={false}>
          <TableWrap><table className="data-table"><tbody>
            {(holidays ?? []).length === 0 && <tr><td className="text-ink-mute">No holidays defined.</td></tr>}
            {(holidays ?? []).map((h) => (
              <tr key={h.holiday_date}><td>{fmtDate(h.holiday_date)} {h.name && <span className="text-ink-mute">· {h.name}</span>}</td>
                <td className="text-right">{access.manage && <ConfirmForm action={removeHoliday} fields={{ project_id: project.id, holiday_date: h.holiday_date }} danger label="Remove" title="Remove holiday?" message="It becomes a normal working day again." confirmLabel="Remove" />}</td></tr>
            ))}
          </tbody></table></TableWrap>
          {access.manage && (
            <form action={addHoliday} className="flex flex-wrap items-end gap-2 border-t border-steel-200 p-4">
              <input type="hidden" name="project_id" value={project.id} />
              <Field label="Date" name="holiday_date"><Input type="date" name="holiday_date" required /></Field>
              <Field label="Name" name="name"><Input name="name" maxLength={80} /></Field>
              <button className="btn btn-secondary">Add holiday</button>
            </form>
          )}
        </Card>

        <Card title="Project members" padded={false}>
          <TableWrap><table className="data-table"><tbody>
            {(members ?? []).length === 0 && <tr><td className="text-ink-mute">No members assigned. Organization admins can always access every project.</td></tr>}
            {(members ?? []).map((m) => (
              <tr key={m.id}><td>{people.get(m.user_id) ?? m.user_id.slice(0, 8)}</td><td>{m.role === "project_manager" ? "Project manager" : "Site engineer"}</td>
                <td className="text-right">{access.manage && <ConfirmForm action={removeProjectMember} fields={{ project_id: project.id, membership_id: m.id }} danger label="Remove" title="Remove member?" message="They lose access to this project (their past reports remain)." confirmLabel="Remove" />}</td></tr>
            ))}
          </tbody></table></TableWrap>
          {access.manage && (
            <form action={addProjectMember} className="flex flex-wrap items-end gap-2 border-t border-steel-200 p-4">
              <input type="hidden" name="project_id" value={project.id} />
              <Field label="Person" name="user_id"><Select name="user_id" required>{(orgMembers ?? []).filter((m) => !memberIds.has(m.user_id)).map((m) => <option key={m.user_id as string} value={m.user_id as string}>{people.get(m.user_id as string)}</option>)}</Select></Field>
              <Field label="Role" name="role"><Select name="role" defaultValue="site_engineer"><option value="site_engineer">Site engineer</option><option value="project_manager">Project manager</option></Select></Field>
              <button className="btn btn-secondary">Add</button>
            </form>
          )}
          <p className="border-t border-steel-200 px-4 py-2 text-xs text-ink-mute">People must belong to the organization first (Organization page).</p>
        </Card>
      </div>

      {access.viewAudit && (
        <Card title="Audit log (latest 40 changes)" className="mt-4" padded={false}>
          <TableWrap><table className="data-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead><tbody>
            {(audit ?? []).length === 0 && <tr><td colSpan={4} className="text-ink-mute">No entries.</td></tr>}
            {((audit ?? []) as { id: number; action: string; table_name: string; record_id: string | null; actor_id: string | null; created_at: string }[]).map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap">{new Date(a.created_at).toLocaleString("en-GB")}</td><td>{a.actor_id ? people.get(a.actor_id) ?? a.actor_id.slice(0, 8) : "system"}</td><td>{a.action}</td><td className="text-xs text-ink-mute">{a.table_name} {a.record_id?.slice(0, 8)}</td></tr>
            ))}
          </tbody></table></TableWrap>
        </Card>
      )}
    </>
  );
}
