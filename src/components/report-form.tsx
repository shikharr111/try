"use client";
import { useActionState, useMemo, useState } from "react";
import { saveReport, type SaveState } from "@/app/actions/reports";
import { DELAY_CATEGORIES } from "@/lib/ai/schema";
import { CATEGORY_LABELS } from "@/lib/format";

/**
 * Daily report editor. State lives in the browser; on submit one JSON payload is posted to the server action,
 * which re-validates everything (lib/reports/payload.ts) before the database function runs.
 * Client-side hints are conveniences only. UNVERIFIED: never rendered in a browser in the build sandbox.
 */
export interface ActivityOption { id: string; code: string; name: string; unit: string; plannedQty: string | null; plannedWorkers: string | null }
export interface ReportInitial {
  header: { report_date: string; shift: string; weather: string; site_conditions: string; observations: string };
  lines: Record<string, string>[]; workforce: Record<string, string>[]; equipment: Record<string, string>[];
}
type Row = Record<string, string>;

const LINE_BLANK = (a?: ActivityOption): Row => ({ activity_id: a?.id ?? "", planned_qty: a?.plannedQty ?? "", actual_qty: "", planned_workers: a?.plannedWorkers ?? "", actual_workers: "", material_available: "", material_notes: "", observations: "" });

export function ReportForm({ projectId, reportId, activities, initial, maxDate, editableDate }: {
  projectId: string; reportId?: string; activities: ActivityOption[]; initial: ReportInitial; maxDate: string; editableDate: boolean;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveReport, {});
  const [header, setHeader] = useState(initial.header);
  const [lines, setLines] = useState<Row[]>(initial.lines.length ? initial.lines : []);
  const [workforce, setWorkforce] = useState<Row[]>(initial.workforce);
  const [equipment, setEquipment] = useState<Row[]>(initial.equipment);
  const [delays, setDelays] = useState<Row[]>([]);
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const used = new Set(lines.map((l) => l.activity_id));
  const free = activities.filter((a) => !used.has(a.id));

  const payload = JSON.stringify({ header, lines, workforce, equipment, delays });
  const upd = (set: (f: (r: Row[]) => Row[]) => void, i: number, k: string, v: string) => set((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const del = (set: (f: (r: Row[]) => Row[]) => void, i: number) => set((rows) => rows.filter((_, j) => j !== i));
  const actSelect = (v: string, on: (v: string) => void, label: string, optional = false) => (
    <select className="input" value={v} onChange={(e) => on(e.target.value)} aria-label={label}>
      {optional && <option value="">(whole site)</option>}
      {!optional && !v && <option value="">Choose…</option>}
      {activities.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
    </select>
  );
  const num = (v: string, on: (v: string) => void, label: string, w = "w-24") => (
    <input className={`input ${w}`} inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} aria-label={label} />
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      {reportId && <input type="hidden" name="report_id" value={reportId} />}
      <input type="hidden" name="payload" value={payload} />

      {state.errors && state.errors.length > 0 && (
        <div role="alert" className="rounded border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          <div className="font-semibold">Please fix the following:</div>
          <ul className="ml-4 list-disc">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <section className="card p-4">
        <h2 className="mb-3">Report details</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="label">Date
            <input type="date" className="input" value={header.report_date} max={maxDate} disabled={!editableDate} onChange={(e) => setHeader({ ...header, report_date: e.target.value })} required />
          </label>
          <label className="label">Shift
            <select className="input" value={header.shift} disabled={!editableDate} onChange={(e) => setHeader({ ...header, shift: e.target.value })}><option value="day">Day</option><option value="night">Night</option></select>
          </label>
          <label className="label sm:col-span-2">Weather
            <input className="input" maxLength={200} value={header.weather} onChange={(e) => setHeader({ ...header, weather: e.target.value })} />
          </label>
          <label className="label sm:col-span-2">Site conditions
            <textarea className="input" rows={2} maxLength={1000} value={header.site_conditions} onChange={(e) => setHeader({ ...header, site_conditions: e.target.value })} />
          </label>
          <label className="label sm:col-span-2">General observations
            <textarea className="input" rows={2} maxLength={4000} value={header.observations} onChange={(e) => setHeader({ ...header, observations: e.target.value })} />
          </label>
        </div>
        {!editableDate && <p className="mt-2 text-xs text-ink-mute">Date and shift identify the report and cannot be changed. Create a new report instead.</p>}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h2>Work completed today</h2>
          <button type="button" className="btn btn-secondary" disabled={free.length === 0} onClick={() => setLines([...lines, LINE_BLANK(free[0])])}>Add activity</button></div>
        {lines.length === 0 && <p className="text-sm text-ink-mute">Add every activity that had work today. Quantity is in the activity&apos;s unit; enter 0 if work was planned but nothing was achieved.</p>}
        <div className="space-y-3">
          {lines.map((l, i) => {
            const a = byId.get(l.activity_id);
            return (
              <fieldset key={i} className="rounded border border-steel-200 p-3">
                <legend className="px-1 text-xs text-ink-mute">Activity {i + 1}</legend>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[14rem] flex-1">{actSelect(l.activity_id, (v) => upd(setLines, i, "activity_id", v), `Activity for line ${i + 1}`)}</div>
                  <label className="label">Planned today ({a?.unit ?? "unit"}){num(l.planned_qty, (v) => upd(setLines, i, "planned_qty", v), "Planned quantity")}</label>
                  <label className="label">Actual today ({a?.unit ?? "unit"}){num(l.actual_qty, (v) => upd(setLines, i, "actual_qty", v), "Actual quantity")}</label>
                  <label className="label">Workers planned{num(l.planned_workers, (v) => upd(setLines, i, "planned_workers", v), "Planned workers", "w-20")}</label>
                  <label className="label">Workers actual{num(l.actual_workers, (v) => upd(setLines, i, "actual_workers", v), "Actual workers", "w-20")}</label>
                  <label className="label">Materials
                    <select className="input" value={l.material_available} onChange={(e) => upd(setLines, i, "material_available", e.target.value)}><option value="">Not stated</option><option value="yes">Available</option><option value="no">Not available</option></select>
                  </label>
                  <button type="button" className="btn btn-ghost" onClick={() => del(setLines, i)} aria-label={`Remove line ${i + 1}`}>Remove</button>
                </div>
                <input className="input mt-2" placeholder="Notes (optional)" maxLength={2000} value={l.observations} onChange={(e) => upd(setLines, i, "observations", e.target.value)} aria-label={`Notes for line ${i + 1}`} />
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h2>Workforce by trade</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setWorkforce([...workforce, { activity_id: "", trade: "", planned_workers: "", actual_workers: "", hours_worked: "" }])}>Add trade</button></div>
        <div className="space-y-2">
          {workforce.map((w, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <input className="input w-44" placeholder="Trade" value={w.trade} maxLength={80} onChange={(e) => upd(setWorkforce, i, "trade", e.target.value)} aria-label="Trade" />
              <div className="min-w-[12rem]">{actSelect(w.activity_id, (v) => upd(setWorkforce, i, "activity_id", v), "Activity", true)}</div>
              {num(w.planned_workers, (v) => upd(setWorkforce, i, "planned_workers", v), "Planned workers", "w-20")}
              {num(w.actual_workers, (v) => upd(setWorkforce, i, "actual_workers", v), "Actual workers", "w-20")}
              {num(w.hours_worked, (v) => upd(setWorkforce, i, "hours_worked", v), "Hours worked", "w-20")}
              <button type="button" className="btn btn-ghost" onClick={() => del(setWorkforce, i)}>Remove</button>
            </div>
          ))}
          {workforce.length === 0 && <p className="text-sm text-ink-mute">Optional. Columns: trade, activity, planned, actual, hours.</p>}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h2>Equipment</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setEquipment([...equipment, { activity_id: "", machine_type: "", machine_count: "1", planned_hours: "", operating_hours: "", downtime_hours: "", downtime_reason: "" }])}>Add machine</button></div>
        <div className="space-y-2">
          {equipment.map((e, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <input className="input w-40" placeholder="Machine type" value={e.machine_type} maxLength={80} onChange={(ev) => upd(setEquipment, i, "machine_type", ev.target.value)} aria-label="Machine type" />
              <div className="min-w-[12rem]">{actSelect(e.activity_id, (v) => upd(setEquipment, i, "activity_id", v), "Activity", true)}</div>
              {num(e.machine_count, (v) => upd(setEquipment, i, "machine_count", v), "Number of machines", "w-16")}
              {num(e.planned_hours, (v) => upd(setEquipment, i, "planned_hours", v), "Planned hours", "w-20")}
              {num(e.operating_hours, (v) => upd(setEquipment, i, "operating_hours", v), "Operating hours", "w-20")}
              {num(e.downtime_hours, (v) => upd(setEquipment, i, "downtime_hours", v), "Downtime hours", "w-20")}
              <input className="input w-44" placeholder="Downtime reason" value={e.downtime_reason} maxLength={300} onChange={(ev) => upd(setEquipment, i, "downtime_reason", ev.target.value)} aria-label="Downtime reason" />
              <button type="button" className="btn btn-ghost" onClick={() => del(setEquipment, i)}>Remove</button>
            </div>
          ))}
          {equipment.length === 0 && <p className="text-sm text-ink-mute">Optional. Columns: type, activity, machines, planned h, operating h, downtime h, reason.</p>}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h2>Delays observed today</h2>
          <button type="button" className="btn btn-secondary" onClick={() => setDelays([...delays, { activity_id: "", category: "other_unknown", duration_working_days: "", description: "" }])}>Log a delay</button></div>
        <p className="mb-2 text-xs text-ink-mute">Describe what happened, not who is at fault. A manager reviews every delay before it counts as confirmed. Each row creates a new delay event when you save.</p>
        <div className="space-y-2">
          {delays.map((d, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <select className="input w-56" value={d.category} onChange={(e) => upd(setDelays, i, "category", e.target.value)} aria-label="Reason">
                {DELAY_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
              <div className="min-w-[12rem]">{actSelect(d.activity_id, (v) => upd(setDelays, i, "activity_id", v), "Affected activity", true)}</div>
              {num(d.duration_working_days, (v) => upd(setDelays, i, "duration_working_days", v), "Working days lost", "w-24")}
              <input className="input min-w-[14rem] flex-1" placeholder="What happened?" maxLength={1000} value={d.description} onChange={(e) => upd(setDelays, i, "description", e.target.value)} aria-label="Description" />
              <button type="button" className="btn btn-ghost" onClick={() => del(setDelays, i)}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="submit" name="intent" value="draft" className="btn btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
        <button type="submit" name="intent" value="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save and submit for review"}</button>
      </div>
    </form>
  );
}
