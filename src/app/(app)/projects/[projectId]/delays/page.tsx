import { Alert, Badge, Card, Empty, Field, Flash, Input, PageHeader, Select, TableWrap, Textarea } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { CategoryBars } from "@/components/charts";
import { createDelay, deleteDelay, reviewDelay } from "@/app/actions/delays";
import { delayDistribution } from "@/lib/analytics/analytics";
import { CATEGORY_LABELS, fmtDate, fmtNum } from "@/lib/format";
import { DELAY_CATEGORIES } from "@/lib/ai/schema";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";

export const dynamic = "force-dynamic";

export default async function DelaysPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project, access } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, null);
  const statusFilter = ["unreviewed", "confirmed", "dismissed"].includes(sp.status ?? "") ? sp.status! : "";
  let q = supabase.from("delay_events").select("id, activity_id, category, start_date, end_date, duration_working_days, description, evidence, review_status, review_comment, created_by").eq("project_id", project.id);
  if (statusFilter) q = q.eq("review_status", statusFilter);
  const [{ data: events }, { data: all }] = await Promise.all([
    q.order("start_date", { ascending: false }).limit(200),
    supabase.from("delay_events").select("category, start_date, end_date, duration_working_days, review_status").eq("project_id", project.id).limit(5000),
  ]);
  const dist = delayDistribution((all ?? []) as never, b.input.calendar);

  return (
    <>
      <PageHeader title="Delay events" subtitle="What slowed the work down. Reasons describe events and conditions; this tool never assigns blame to a person or party." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Working days lost by reason" className="lg:col-span-2">
          <CategoryBars data={dist.rows.map((r) => ({ label: CATEGORY_LABELS[r.category] ?? r.category, days: r.workingDays, confirmed: r.confirmedWorkingDays }))} />
          <p className="mt-2 text-xs text-ink-mute">{dist.note} Distinct delayed working days (overlaps counted once): <strong>{dist.distinctDelayedWorkingDays}</strong>. Dismissed events excluded: {dist.dismissedExcluded}.</p>
        </Card>
        <Card title="Log a delay event">
          <form action={createDelay} className="space-y-3">
            <input type="hidden" name="project_id" value={project.id} />
            <Field label="Reason" name="category"><Select name="category" required defaultValue="other_unknown">{DELAY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}</Select></Field>
            <Field label="Affected activity" name="activity_id"><Select name="activity_id" defaultValue=""><option value="">(whole project)</option>{b.baseline.map((r) => <option key={r.activity_id} value={r.activity_id}>{r.code} {r.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" name="start_date" required><Input type="date" name="start_date" required max={b.today} /></Field>
              <Field label="To" name="end_date" required><Input type="date" name="end_date" required /></Field>
            </div>
            <Field label="Working days lost" name="duration_working_days" hint="Leave empty to use the calendar count of the date range."><Input name="duration_working_days" inputMode="decimal" /></Field>
            <Field label="What happened" name="description" required><Textarea name="description" required maxLength={1000} /></Field>
            <Field label="Evidence (optional)" name="evidence"><Textarea name="evidence" rows={2} maxLength={1000} /></Field>
            <button className="btn btn-primary" disabled={!access.report}>Log delay</button>
          </form>
        </Card>
      </div>

      <form method="get" className="mt-4 flex items-end gap-2">
        <label className="label">Show<Select name="status" defaultValue={statusFilter}><option value="">All</option><option value="unreviewed">Awaiting review</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option></Select></label>
        <button className="btn btn-secondary">Filter</button>
      </form>
      <Card className="mt-3" padded={false}>
        {(events ?? []).length === 0 ? <div className="p-4"><Empty title="No delay events">Nothing logged for this filter.</Empty></div> : (
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Dates</th><th>Reason</th><th>Activity</th><th className="num">Days lost</th><th>Description</th><th>Status</th><th /></tr></thead>
              <tbody>
                {(events ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDate(e.start_date)}{e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ""}</td>
                    <td>{CATEGORY_LABELS[e.category] ?? e.category}</td>
                    <td>{e.activity_id ? b.codeById.get(e.activity_id) ?? "—" : "Whole project"}</td>
                    <td className="num">{e.duration_working_days === null ? "calendar" : fmtNum(e.duration_working_days, 1)}</td>
                    <td className="max-w-xs text-sm">{e.description}{e.review_comment && <div className="text-xs text-ink-mute">Reviewer: {e.review_comment}</div>}</td>
                    <td><Badge tone={e.review_status === "confirmed" ? "ok" : e.review_status === "dismissed" ? "neutral" : "warn"}>{e.review_status === "unreviewed" ? "Awaiting review" : e.review_status}</Badge></td>
                    <td className="space-x-1 whitespace-nowrap">
                      {access.review && (
                        <>
                          <form action={reviewDelay} className="inline"><input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="delay_id" value={e.id} /><input type="hidden" name="status" value="confirmed" /><button className="btn btn-secondary" disabled={e.review_status === "confirmed"}>Confirm</button></form>
                          <ConfirmForm action={reviewDelay} fields={{ project_id: project.id, delay_id: e.id, status: "dismissed" }} label="Dismiss" title="Dismiss this delay event?" confirmLabel="Dismiss" message="Dismissed events are excluded from totals and from AI evidence.">
                            <label className="label">Reason (required)<textarea name="comment" className="input" rows={2} required maxLength={1000} /></label>
                          </ConfirmForm>
                        </>
                      )}
                      <ConfirmForm action={deleteDelay} fields={{ project_id: project.id, delay_id: e.id }} danger label="Delete" title="Delete this event?" confirmLabel="Delete" message="Only unreviewed events you created (or any event, for managers) can be deleted." />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {!access.review && <div className="mt-3"><Alert tone="info">Only project managers and organization admins can confirm or dismiss delay events.</Alert></div>}
    </>
  );
}
