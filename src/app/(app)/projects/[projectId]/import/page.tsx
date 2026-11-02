import { Alert, Card, PageHeader, TableWrap } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";
import { IMPORT_KIND_LABELS } from "@/lib/import/definitions";
import { fmtDate } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, project, access } = await getProjectContext(projectId);
  const { data: jobs } = await supabase.from("import_jobs").select("id, kind, file_name, row_count, status, created_at, summary").eq("project_id", project.id).order("created_at", { ascending: false }).limit(15);
  const api = `/projects/${project.id}/api/export`;
  return (
    <>
      <PageHeader title="Import / export" subtitle="CSV and Excel (.xlsx). Imports are all-or-nothing and never overwrite existing records or an approved baseline." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Import" className="lg:col-span-2">
          {access.report ? <ImportWizard projectId={project.id} canManage={access.manage} /> : <Alert tone="warn">You do not have permission to import data.</Alert>}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-ink-mute">
            <li>Activity codes are case-sensitive. Dates: YYYY-MM-DD or DD/MM/YYYY (day first). Numbers: plain or with 1,234.56 thousands separators.</li>
            <li>Activities and dependencies go into a draft baseline revision that a manager must approve. Daily reports are created as drafts.</li>
            <li>Workforce and equipment rows attach to an existing report for the same date and shift of the importing user.</li>
          </ul>
        </Card>
        <Card title="Export">
          <p className="mb-3 text-sm text-ink-mute">Exports contain only data you are allowed to see. For filtered report exports use the filters on the Reports page.</p>
          <ul className="space-y-2 text-sm">
            {[["reports", "Daily report lines"], ["baseline", "Approved baseline"], ["delays", "Delay events"], ["workforce", "Workforce"], ["equipment", "Equipment"]].map(([k, l]) => (
              <li key={k} className="flex items-center justify-between"><span>{l}</span><span className="flex gap-2"><a href={`${api}?kind=${k}&format=csv`}>CSV</a><a href={`${api}?kind=${k}&format=xlsx`}>Excel</a></span></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Import history" className="mt-4" padded={false}>
        <TableWrap><table className="data-table"><thead><tr><th>When</th><th>Type</th><th>File</th><th className="num">Rows</th><th>Result</th></tr></thead><tbody>
          {(jobs ?? []).length === 0 && <tr><td colSpan={5} className="text-ink-mute">No imports yet.</td></tr>}
          {(jobs ?? []).map((j) => (
            <tr key={j.id}><td>{fmtDate(j.created_at)}</td><td>{IMPORT_KIND_LABELS[j.kind as keyof typeof IMPORT_KIND_LABELS] ?? j.kind}</td><td className="text-sm">{j.file_name}</td><td className="num">{j.row_count}</td><td>{j.status === "committed" ? "Imported" : `Rejected: ${(j.summary as { error?: string })?.error ?? ""}`}</td></tr>
          ))}
        </tbody></table></TableWrap>
      </Card>
    </>
  );
}
