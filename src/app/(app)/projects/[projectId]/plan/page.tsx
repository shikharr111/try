import Link from "next/link";
import { Alert, Badge, Card, Empty, Field, Flash, Hint, Input, PageHeader, ProgressBar, Select, TableWrap, Textarea } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { Gantt, GanttLegend } from "@/components/gantt";
import { addDependency, addActivity, approveRevision, discardDraft, removeBaselineRow, removeDependency, saveDailyTargets, startDraft, updateBaselineRow } from "@/app/actions/planning";
import { addMilestone, setMilestoneStatus } from "@/app/actions/projects";
import { fmtDate, fmtNum } from "@/lib/format";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";
import type { GanttInput } from "@/lib/gantt/layout";
import { num } from "@/lib/analytics/analytics";
import { compareDates, countWorkingDays, isValidISODate } from "@/lib/calc";

export const dynamic = "force-dynamic";

interface DraftRow {
  activity_id: string; planned_start: string; planned_finish: string; total_qty: number | string;
  planned_workers: number | string | null; planned_machine_hours: number | string | null; distribution: string;
  activity: { code: string; name: string; unit: string } | null;
}

export default async function PlanPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { supabase, project, access } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, null);
  const m = b.metrics;

  const [{ data: revisions }, { data: milestones }, { data: wbs }] = await Promise.all([
    supabase.from("baseline_revisions").select("id, revision_no, name, reason, status, approved_at, created_at").eq("project_id", project.id).order("revision_no", { ascending: false }),
    supabase.from("milestones").select("id, name, target_date, status, achieved_date").eq("project_id", project.id).order("target_date"),
    supabase.from("wbs_nodes").select("id, code, name").eq("project_id", project.id).limit(500),
  ]);
  const wbsName = new Map((wbs ?? []).map((w) => [w.id as string, `${w.code} ${w.name}`.trim()]));
  const draft = (revisions ?? []).find((r) => r.status === "draft") ?? null;

  let draftRows: DraftRow[] = [];
  let draftDeps: { id: string; predecessor_id: string; successor_id: string; lag_working_days: number }[] = [];
  if (draft) {
    const [rows, deps] = await Promise.all([
      supabase.from("baseline_activities").select("activity_id, planned_start, planned_finish, total_qty, planned_workers, planned_machine_hours, distribution, activity:activities(code, name, unit)").eq("revision_id", draft.id).limit(2000),
      supabase.from("activity_dependencies").select("id, predecessor_id, successor_id, lag_working_days").eq("revision_id", draft.id).limit(5000),
    ]);
    draftRows = ((rows.data ?? []) as unknown as DraftRow[]).sort((a, c) => (a.activity?.code ?? "").localeCompare(c.activity?.code ?? ""));
    draftDeps = (deps.data ?? []) as typeof draftDeps;
  }
  const draftCode = new Map(draftRows.map((r) => [r.activity_id, r.activity?.code ?? "?"]));

  const here0 = `/projects/${project.id}/plan`;

  // ---- activity filters (GET form). Everything shown is computed by the engine; nothing is invented. ----
  const q = (sp.q ?? "").trim().toLowerCase();
  const state = ["not_started", "in_progress", "completed", "behind"].includes(sp.state ?? "") ? sp.state! : "";
  const from = sp.from && isValidISODate(sp.from) ? sp.from : "";
  const to = sp.to && isValidISODate(sp.to) ? sp.to : "";
  const critOnly = sp.critical === "1";
  const predOf = new Map<string, string[]>();
  for (const d of b.input.dependencies) {
    const arr = predOf.get(d.successorId) ?? [];
    arr.push(`${b.codeById.get(d.predecessorId) ?? "?"}${d.lagWorkingDays ? ` (${d.lagWorkingDays > 0 ? "+" : ""}${d.lagWorkingDays}d)` : ""}`);
    predOf.set(d.successorId, arr);
  }
  const gItems: GanttInput[] = b.baseline.map((r) => {
    const f = m.forecast.activities[r.activity_id];
    const p = m.progress[r.activity_id];
    return {
      id: r.activity_id, label: `${r.code} ${r.name}`, start: r.planned_start, finish: r.planned_finish,
      actualPct: num(p?.actualPctCapped), plannedPct: num(p?.plannedPct),
      critical: !!m.cpm.activities[r.activity_id]?.critical,
      forecastFinish: f?.forecastFinish ?? null, status: f?.status ?? "insufficient_data",
    };
  });
  const visibleRows = b.baseline.filter((r) => {
    const p = m.progress[r.activity_id];
    const actual = num(p?.actualPct ?? null) ?? 0;
    const variance = p?.progressVariancePp ? num(p.progressVariancePp) : null;
    const wp = r.wbs_node_id ? wbsName.get(r.wbs_node_id) ?? "" : "";
    if (q && !`${r.code} ${r.name} ${wp}`.toLowerCase().includes(q)) return false;
    if (critOnly && !m.cpm.activities[r.activity_id]?.critical) return false;
    if (state === "not_started" && actual > 0) return false;
    if (state === "in_progress" && !(actual > 0 && actual < 100)) return false;
    if (state === "completed" && actual < 100) return false;
    if (state === "behind" && !((variance ?? 0) < 0 && actual < 100)) return false;
    if (from && compareDates(r.planned_finish, from) < 0) return false;
    if (to && compareDates(r.planned_start, to) > 0) return false;
    return true;
  });
  const visibleIds = new Set(visibleRows.map((r) => r.activity_id));
  const gItemsVisible = gItems.filter((g) => visibleIds.has(g.id));
  const gDeps = b.input.dependencies.filter((d) => visibleIds.has(d.predecessorId) && visibleIds.has(d.successorId)).map((d) => ({ from: d.predecessorId, to: d.successorId }));

  return (
    <>
      <PageHeader title="Plan & Gantt" subtitle={b.revisionNo ? `Approved baseline revision ${b.revisionNo}` : "No approved baseline"} />
      <Flash ok={sp.ok} err={sp.err} />

      <Card title="Gantt (approved baseline)" padded>
        {gItems.length === 0 ? <Empty title="Nothing to draw yet">Approve a baseline revision to see the Gantt chart.</Empty> : gItemsVisible.length === 0 ? <Empty title="No activity matches the filters">Change or reset the filters below.</Empty> : (
          <>
            <Gantt items={gItemsVisible} deps={gDeps} today={b.today} />
            <div className="mt-2"><GanttLegend /></div>
            <p className="mt-2 text-xs text-ink-mute">
              Critical path = activities with zero total float in the finish-to-start network ({m.cpm.criticalActivityIds.length} activities, {m.cpm.projectDurationWorkingDays} working days). Only finish-to-start links are supported.
            </p>
          </>
        )}
      </Card>

      {gItems.length > 0 && (
        <>
          <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-3" aria-label="Activity filters">
            <div className="min-w-[11rem] flex-1"><label className="label" htmlFor="pq">Search activities</label><input id="pq" name="q" type="search" className="input" defaultValue={sp.q ?? ""} placeholder="Code, name or work package" /></div>
            <div><label className="label" htmlFor="pstate">Progress</label>
              <select id="pstate" name="state" className="input" defaultValue={state}><option value="">All</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="behind">Behind plan</option></select></div>
            <div><label className="label" htmlFor="pfrom">Finishes on/after</label><input id="pfrom" name="from" type="date" className="input" defaultValue={from} /></div>
            <div><label className="label" htmlFor="pto">Starts on/before</label><input id="pto" name="to" type="date" className="input" defaultValue={to} /></div>
            <label className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" name="critical" value="1" defaultChecked={critOnly} /> Critical path only</label>
            <button className="btn btn-primary" type="submit">Apply</button>
            <Link href={here0} className="btn btn-ghost">Reset</Link>
          </form>
          <Card title={`Activities (${visibleRows.length} of ${b.baseline.length})`} className="mt-3" padded={false}>
            <TableWrap>
              <table className="data-table">
                <thead><tr><th>Code</th><th>Activity</th><th>Work package</th><th>Start</th><th>Finish</th><th className="num">Duration<Hint text="Working days between baseline start and finish, using this project's working weekdays and holidays." /></th><th className="num">Quantity</th><th>Progress</th><th>Predecessors</th><th>Critical</th></tr></thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const p = m.progress[r.activity_id];
                    return (
                      <tr key={r.activity_id}>
                        <td className="font-mono text-xs">{r.code}</td><td>{r.name}</td>
                        <td className="text-xs text-ink-mute">{r.wbs_node_id ? wbsName.get(r.wbs_node_id) ?? "—" : "—"}</td>
                        <td className="whitespace-nowrap">{fmtDate(r.planned_start)}</td><td className="whitespace-nowrap">{fmtDate(r.planned_finish)}</td>
                        <td className="num">{countWorkingDays(b.input.calendar, r.planned_start, r.planned_finish)} wd</td>
                        <td className="num">{fmtNum(r.total_qty, 2)} {r.unit}</td>
                        <td><ProgressBar planned={num(p?.plannedPct)} actual={num(p?.actualPct)} /><div className="mt-1 text-xs text-ink-mute">{num(p?.actualPct) ?? "—"}% actual · {num(p?.plannedPct) ?? "—"}% planned</div></td>
                        <td className="text-xs">{(predOf.get(r.activity_id) ?? []).join(", ") || "—"}</td>
                        <td>{m.cpm.activities[r.activity_id]?.critical ? <Badge tone="bad">Critical</Badge> : <span className="text-xs text-ink-mute">{m.cpm.activities[r.activity_id] ? `${m.cpm.activities[r.activity_id].totalFloat} wd float` : "—"}</span>}</td>
                      </tr>
                    );
                  })}
                  {visibleRows.length === 0 && <tr><td colSpan={10} className="text-ink-mute">No activity matches the filters.</td></tr>}
                </tbody>
              </table>
            </TableWrap>
            {(milestones ?? []).length > 0 && (
              <div className="border-t border-steel-200 px-4 py-3 text-xs text-ink-mute"><span className="font-semibold">Milestones: </span>{(milestones ?? []).map((x) => `${x.name} (${fmtDate(x.target_date)}${x.status === "achieved" ? ", achieved" : ""})`).join(" · ")}</div>
            )}
          </Card>
        </>
      )}

      <Card title="Baseline revisions" className="mt-4" padded={false}
        actions={access.manage && !draft ? (
          <ConfirmForm action={startDraft} fields={{ project_id: project.id }} label="Start a new revision" title="Start a new baseline revision"
            message="Copies the current approved baseline into an editable draft. The approved baseline stays untouched until you approve the draft." confirmLabel="Start draft">
            <Field label="Reason for the revision" name="reason"><Textarea name="reason" rows={2} maxLength={500} /></Field>
          </ConfirmForm>
        ) : null}>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Rev</th><th>Status</th><th>Reason</th><th>Approved</th></tr></thead>
            <tbody>
              {(revisions ?? []).length === 0 && <tr><td colSpan={4} className="text-ink-mute">No revisions yet.</td></tr>}
              {(revisions ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.revision_no}</td>
                  <td><Badge tone={r.status === "approved" ? "ok" : r.status === "draft" ? "info" : "neutral"}>{r.status}</Badge></td>
                  <td className="text-sm">{r.reason ?? "—"}</td>
                  <td>{r.approved_at ? fmtDate(r.approved_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {!draft && access.manage && (revisions ?? []).length === 0 && (
        <div className="mt-4"><Alert tone="info" title="No baseline yet">Start the first revision, add activities (or import them), then approve it. Approved baselines are immutable: later changes go through a new revision so history is preserved.</Alert>
          <form action={startDraft} className="mt-3"><input type="hidden" name="project_id" value={project.id} /><button className="btn btn-primary">Start the first baseline</button></form></div>
      )}

      {draft && (
        <Card title={`Draft revision ${draft.revision_no}`} className="mt-4" padded={false}
          actions={access.manage ? (
            <>
              <ConfirmForm action={discardDraft} fields={{ project_id: project.id, revision_id: draft.id }} danger label="Discard draft" title="Discard this draft?" message="The draft and its edits are deleted. The approved baseline is unchanged." confirmLabel="Discard" />
              <ConfirmForm action={approveRevision} fields={{ project_id: project.id, revision_id: draft.id }} label="Approve as baseline" title="Approve this revision?" confirmLabel="Approve"
                message="It becomes the baseline used for every metric and cannot be edited afterwards. Reports are never changed." />
            </>
          ) : null}>
          <div className="px-4 pt-3"><Alert tone="info">Editing a draft never changes live metrics. Dependencies must be acyclic; custom daily targets must add up to the total quantity.</Alert></div>
          <TableWrap>
            <table className="data-table">
              <thead><tr><th>Code</th><th>Activity</th><th>Start</th><th>Finish</th><th className="num">Quantity</th><th>Unit</th><th className="num">Workers</th><th className="num">Mach-h</th><th>Daily plan</th><th /></tr></thead>
              <tbody>
                {draftRows.length === 0 && <tr><td colSpan={10} className="text-ink-mute">No activities yet. Add one below or import a CSV/Excel file.</td></tr>}
                {draftRows.map((r) => (
                  <tr key={r.activity_id}>
                    <td className="font-medium">{r.activity?.code}</td>
                    <td>{r.activity?.name}</td>
                    {access.manage ? (
                      <>
                        <td colSpan={6}>
                          <form action={updateBaselineRow} className="flex flex-wrap items-end gap-1">
                            <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="revision_id" value={draft.id} /><input type="hidden" name="activity_id" value={r.activity_id} />
                            <Input type="date" name="planned_start" defaultValue={r.planned_start} required aria-label={`Start ${r.activity?.code}`} className="w-36" />
                            <Input type="date" name="planned_finish" defaultValue={r.planned_finish} required aria-label={`Finish ${r.activity?.code}`} className="w-36" />
                            <Input name="total_qty" defaultValue={String(r.total_qty)} inputMode="decimal" required aria-label={`Quantity ${r.activity?.code}`} className="w-28" />
                            <span className="text-xs text-ink-mute">{r.activity?.unit}</span>
                            <Input name="planned_workers" defaultValue={r.planned_workers ?? ""} inputMode="decimal" aria-label={`Workers ${r.activity?.code}`} className="w-20" />
                            <Input name="planned_machine_hours" defaultValue={r.planned_machine_hours ?? ""} inputMode="decimal" aria-label={`Machine hours ${r.activity?.code}`} className="w-24" />
                            <button className="btn btn-secondary">Save</button>
                          </form>
                        </td>
                        <td>{r.distribution === "custom" ? <Badge tone="info">Custom</Badge> : <span className="text-xs text-ink-mute">Linear</span>}</td>
                        <td>
                          <ConfirmForm action={removeBaselineRow} fields={{ project_id: project.id, revision_id: draft.id, activity_id: r.activity_id }} danger label="Remove" title={`Remove ${r.activity?.code}?`} message="Removes the activity from this draft along with its dependencies and daily targets." confirmLabel="Remove" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{fmtDate(r.planned_start)}</td><td>{fmtDate(r.planned_finish)}</td><td className="num">{fmtNum(r.total_qty, 2)}</td><td>{r.activity?.unit}</td>
                        <td className="num">{fmtNum(r.planned_workers)}</td><td className="num">{fmtNum(r.planned_machine_hours)}</td><td>{r.distribution}</td><td />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {access.manage && (
            <div className="grid gap-4 border-t border-steel-200 p-4 lg:grid-cols-2">
              <form action={addActivity} className="space-y-3">
                <h3>Add activity</h3>
                <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="revision_id" value={draft.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code" name="code" required><Input name="code" required maxLength={40} /></Field>
                  <Field label="Unit" name="unit" required hint="e.g. m3, m2, t"><Input name="unit" required maxLength={20} /></Field>
                </div>
                <Field label="Name" name="name" required><Input name="name" required maxLength={200} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Planned start" name="planned_start" required><Input type="date" name="planned_start" required /></Field>
                  <Field label="Planned finish" name="planned_finish" required><Input type="date" name="planned_finish" required /></Field>
                  <Field label="Total quantity" name="total_qty" required><Input name="total_qty" inputMode="decimal" required /></Field>
                  <Field label="WBS group" name="wbs_code"><Input name="wbs_code" maxLength={60} /></Field>
                  <Field label="Planned workers" name="planned_workers"><Input name="planned_workers" inputMode="decimal" /></Field>
                  <Field label="Planned machine-hours" name="planned_machine_hours"><Input name="planned_machine_hours" inputMode="decimal" /></Field>
                </div>
                <button className="btn btn-primary">Add to draft</button>
              </form>

              <div className="space-y-5">
                <div className="space-y-3">
                <form action={addDependency} className="space-y-3">
                  <h3>Add dependency (finish-to-start)</h3>
                  <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="revision_id" value={draft.id} />
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Predecessor" name="predecessor_id"><Select name="predecessor_id" required>{draftRows.map((r) => <option key={r.activity_id} value={r.activity_id}>{r.activity?.code}</option>)}</Select></Field>
                    <Field label="Successor" name="successor_id"><Select name="successor_id" required>{draftRows.map((r) => <option key={r.activity_id} value={r.activity_id}>{r.activity?.code}</option>)}</Select></Field>
                    <Field label="Lag (working days)" name="lag_working_days"><Input name="lag_working_days" type="number" step={1} defaultValue={0} /></Field>
                  </div>
                  <button className="btn btn-secondary" disabled={draftRows.length < 2}>Add dependency</button>
                </form>
                  <ul className="space-y-1 text-sm">
                    {draftDeps.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded border border-steel-200 px-2 py-1">
                        <span>{draftCode.get(d.predecessor_id)} → {draftCode.get(d.successor_id)}{d.lag_working_days ? ` (lag ${d.lag_working_days})` : ""}</span>
                        <ConfirmForm action={removeDependency} fields={{ project_id: project.id, revision_id: draft.id, dependency_id: d.id }} danger label="Remove" title="Remove dependency?" message="The link is removed from this draft." confirmLabel="Remove" />
                      </li>
                    ))}
                    {draftDeps.length === 0 && <li className="text-ink-mute">No dependencies in this draft.</li>}
                  </ul>
                </div>

                <form action={saveDailyTargets} className="space-y-3">
                  <h3>Custom daily targets</h3>
                  <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="revision_id" value={draft.id} />
                  <Field label="Activity" name="activity_id"><Select name="activity_id" required>{draftRows.map((r) => <option key={r.activity_id} value={r.activity_id}>{r.activity?.code} {r.activity?.name}</option>)}</Select></Field>
                  <Field label="Targets (one per line: date, quantity)" name="targets" hint="Must add up to the activity's total quantity. Leave empty to revert to linear distribution."><Textarea name="targets" rows={5} className="font-mono text-xs" placeholder={"2026-11-02, 40\n2026-11-03, 60"} /></Field>
                  <button className="btn btn-secondary" disabled={draftRows.length === 0}>Save targets</button>
                </form>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="Milestones" className="mt-4" padded={false}>
        <TableWrap>
          <table className="data-table">
            <thead><tr><th>Milestone</th><th>Target</th><th>Status</th>{access.manage && <th />}</tr></thead>
            <tbody>
              {(milestones ?? []).length === 0 && <tr><td colSpan={4} className="text-ink-mute">No milestones.</td></tr>}
              {(milestones ?? []).map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td><td>{fmtDate(x.target_date)}</td>
                  <td>{x.status === "achieved" ? `Achieved ${fmtDate(x.achieved_date)}` : x.status}</td>
                  {access.manage && (
                    <td>
                      <form action={setMilestoneStatus} className="flex items-center gap-1">
                        <input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="milestone_id" value={x.id} />
                        <Select name="status" defaultValue={x.status} aria-label={`Status of ${x.name}`} className="w-28"><option value="pending">Pending</option><option value="achieved">Achieved</option><option value="missed">Missed</option></Select>
                        <Input type="date" name="achieved_date" defaultValue={x.achieved_date ?? ""} aria-label="Achieved date" className="w-36" />
                        <button className="btn btn-secondary">Update</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {access.manage && (
          <form action={addMilestone} className="flex flex-wrap items-end gap-2 border-t border-steel-200 p-4">
            <input type="hidden" name="project_id" value={project.id} />
            <Field label="New milestone" name="name"><Input name="name" required maxLength={160} /></Field>
            <Field label="Target date" name="target_date"><Input type="date" name="target_date" required /></Field>
            <button className="btn btn-primary">Add milestone</button>
          </form>
        )}
      </Card>
    </>
  );
}
