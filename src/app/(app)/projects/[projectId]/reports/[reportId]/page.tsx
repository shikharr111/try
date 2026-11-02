import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, Flash, PageHeader, ReportStatusBadge, TableWrap } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { ReportForm, type ActivityOption } from "@/components/report-form";
import { approveReport, deleteAttachment, deleteReport, recallReport, rejectReport, submitReport, uploadAttachment } from "@/app/actions/reports";
import { CATEGORY_LABELS, fmtDate, fmtNum } from "@/lib/format";
import { reportActions, type ReportStatus } from "@/lib/permissions";
import { getProjectContext, isUuid } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";

export const dynamic = "force-dynamic";
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function ReportPage({ params, searchParams }: { params: Promise<{ projectId: string; reportId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId, reportId } = await params;
  const sp = await searchParams;
  if (!isUuid(reportId)) notFound();
  const { supabase, project, access, user } = await getProjectContext(projectId);
  const { data: report } = await supabase.from("daily_reports").select("*, reporter:profiles!daily_reports_reporter_id_fkey(full_name, email), reviewer:profiles!daily_reports_reviewed_by_fkey(full_name, email)").eq("id", reportId).eq("project_id", project.id).maybeSingle();
  if (!report) notFound();

  const [lines, wf, eq, delays, atts, audit, b] = await Promise.all([
    supabase.from("daily_report_lines").select("*").eq("report_id", reportId).order("created_at"),
    supabase.from("workforce_records").select("*").eq("report_id", reportId),
    supabase.from("equipment_records").select("*").eq("report_id", reportId),
    supabase.from("delay_events").select("id, category, description, review_status, duration_working_days").eq("report_id", reportId),
    supabase.from("attachments").select("id, file_name, mime_type, size_bytes, storage_path").eq("report_id", reportId),
    access.viewAudit ? supabase.from("audit_logs").select("id, action, created_at, actor_id, new_data, old_data").eq("table_name", "daily_reports").eq("record_id", reportId).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    loadProjectBundle(supabase, project, null),
  ]);
  const codeOf = new Map(b.baseline.map((r) => [r.activity_id, `${r.code} ${r.name}`]));
  const can = reportActions({ status: report.status as ReportStatus, isReporter: report.reporter_id === user.id, access });
  const who = (p: { full_name: string | null; email: string | null } | null) => p?.full_name || p?.email || "—";

  // short-lived signed links so the private bucket is never made public
  const signed = new Map<string, string>();
  for (const a of atts.data ?? []) {
    const { data } = await supabase.storage.from("attachments").createSignedUrl(a.storage_path as string, 300);
    if (data?.signedUrl) signed.set(a.id as string, data.signedUrl);
  }

  const activities: ActivityOption[] = b.baseline.map((r) => ({ id: r.activity_id, code: r.code, name: r.name, unit: r.unit, plannedQty: null, plannedWorkers: r.planned_workers === null ? null : String(r.planned_workers) }));
  const here = { project_id: project.id, report_id: reportId };

  return (
    <>
      <PageHeader title={`Report · ${fmtDate(report.report_date)} (${report.shift})`}
        subtitle={<>by {who(report.reporter)} · version {report.version} · <ReportStatusBadge status={report.status} /></>}
        actions={<Link href={`/projects/${project.id}/reports`} className="btn btn-ghost">Back to list</Link>} />
      <Flash ok={sp.ok} err={sp.err} />
      {report.review_comment && <div className="mb-4"><Alert tone={report.status === "rejected" ? "warn" : "info"} title={`Reviewer comment (${who(report.reviewer)})`}>{report.review_comment}</Alert></div>}

      <div className="no-print mb-4 flex flex-wrap gap-2">
        {can.submit && <form action={submitReport}><input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="report_id" value={reportId} /><button className="btn btn-primary">Submit for review</button></form>}
        {can.recall && <form action={recallReport}><input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="report_id" value={reportId} /><button className="btn btn-secondary">Recall to draft</button></form>}
        {can.approve && <ConfirmForm action={approveReport} fields={here} label="Approve" title="Approve this report?" confirmLabel="Approve" message="Approved reports are locked. A manager can still return them for correction." />}
        {can.reject && <ConfirmForm action={rejectReport} fields={here} danger label={report.status === "approved" ? "Reopen (return)" : "Return for changes"} title="Return this report" confirmLabel="Return" message="The reporter will see your comment and can edit and resubmit. Its quantities stop counting until resubmitted.">
          <label className="label">Comment (required)<textarea name="comment" className="input" rows={3} maxLength={1000} required /></label></ConfirmForm>}
        {can.delete && <ConfirmForm action={deleteReport} fields={here} danger label="Delete" title="Delete this report?" message="The report and its lines are permanently removed." confirmLabel="Delete" />}
      </div>

      {can.edit ? (
        <ReportForm projectId={project.id} reportId={reportId} activities={activities} maxDate={b.today} editableDate={false}
          initial={{
            header: { report_date: report.report_date, shift: report.shift, weather: s(report.weather), site_conditions: s(report.site_conditions), observations: s(report.observations) },
            lines: (lines.data ?? []).map((l) => ({ activity_id: l.activity_id, planned_qty: s(l.planned_qty), actual_qty: s(l.actual_qty), planned_workers: s(l.planned_workers), actual_workers: s(l.actual_workers), material_available: l.material_available === null ? "" : l.material_available ? "yes" : "no", material_notes: s(l.material_notes), observations: s(l.observations) })),
            workforce: (wf.data ?? []).map((w) => ({ activity_id: s(w.activity_id), trade: w.trade, planned_workers: s(w.planned_workers), actual_workers: s(w.actual_workers), hours_worked: s(w.hours_worked) })),
            equipment: (eq.data ?? []).map((e) => ({ activity_id: s(e.activity_id), machine_type: e.machine_type, machine_count: s(e.machine_count), planned_hours: s(e.planned_hours), operating_hours: s(e.operating_hours), downtime_hours: s(e.downtime_hours), downtime_reason: s(e.downtime_reason) })),
          }} />
      ) : (
        <div className="space-y-4">
          <Card title="Work completed" padded={false}><TableWrap><table className="data-table"><thead><tr><th>Activity</th><th className="num">Planned</th><th className="num">Actual</th><th>Unit</th><th className="num">Workers (plan/actual)</th><th>Notes</th></tr></thead><tbody>
            {(lines.data ?? []).map((l) => <tr key={l.id}><td>{codeOf.get(l.activity_id) ?? l.activity_id}</td><td className="num">{fmtNum(l.planned_qty, 2)}</td><td className="num">{fmtNum(l.actual_qty, 2)}</td><td>{l.unit}</td><td className="num">{fmtNum(l.planned_workers)} / {fmtNum(l.actual_workers)}</td><td className="text-sm">{l.observations ?? ""}</td></tr>)}
          </tbody></table></TableWrap></Card>
          <Card title="Conditions"><p className="text-sm">Weather: {report.weather ?? "—"}</p><p className="text-sm">Site conditions: {report.site_conditions ?? "—"}</p><p className="text-sm">Observations: {report.observations ?? "—"}</p></Card>
        </div>
      )}

      {(delays.data ?? []).length > 0 && (
        <Card title="Delay events logged with this report" className="mt-4">
          <ul className="space-y-1 text-sm">{(delays.data ?? []).map((d) => <li key={d.id}><strong>{CATEGORY_LABELS[d.category] ?? d.category}</strong> ({d.review_status}) {d.duration_working_days ? `· ${d.duration_working_days} working days` : ""} — {d.description}</li>)}</ul>
          <Link href={`/projects/${project.id}/delays`} className="mt-2 inline-block text-sm">Manage delay events</Link>
        </Card>
      )}

      <Card title="Attachments" className="mt-4">
        <ul className="space-y-1 text-sm">
          {(atts.data ?? []).length === 0 && <li className="text-ink-mute">No attachments.</li>}
          {(atts.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span>{signed.get(a.id as string) ? <a href={signed.get(a.id as string)} target="_blank" rel="noopener noreferrer">{a.file_name}</a> : a.file_name} <span className="text-xs text-ink-mute">({fmtNum(Number(a.size_bytes) / 1024)} KB)</span></span>
              {can.edit && <ConfirmForm action={deleteAttachment} fields={{ ...here, attachment_id: a.id as string }} danger label="Remove" title="Remove attachment?" message="The file is deleted." confirmLabel="Remove" />}
            </li>
          ))}
        </ul>
        {can.edit && (
          <form action={uploadAttachment} encType="multipart/form-data" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="report_id" value={reportId} />
            <label className="label">Photo or PDF (max 10 MB)<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input" required /></label>
            <button className="btn btn-secondary">Upload</button>
          </form>
        )}
      </Card>

      {access.viewAudit && (
        <Card title="Edit history" className="mt-4" padded={false}>
          <TableWrap><table className="data-table"><thead><tr><th>When</th><th>Action</th><th>Status change</th></tr></thead><tbody>
            {((audit.data ?? []) as { id: number; action: string; created_at: string; old_data: { status?: string } | null; new_data: { status?: string } | null }[]).map((a) => (
              <tr key={a.id}><td>{new Date(a.created_at).toLocaleString("en-GB")}</td><td>{a.action}</td><td>{a.old_data?.status && a.new_data?.status && a.old_data.status !== a.new_data.status ? `${a.old_data.status} → ${a.new_data.status}` : "—"}</td></tr>
            ))}
            {(audit.data ?? []).length === 0 && <tr><td colSpan={3} className="text-ink-mute">No history.</td></tr>}
          </tbody></table></TableWrap>
        </Card>
      )}
    </>
  );
}
