import { Field, Input, Select, Textarea } from "@/components/ui";
import type { ProjectRow } from "@/lib/server/session";

const DAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["0", "Sun"]] as const;
const TYPES = ["Residential building", "Commercial building", "Industrial", "Infrastructure", "Renovation", "Other"];

export function ProjectFields({ project, managers }: { project?: ProjectRow; managers: { id: string; name: string }[] }) {
  const days = new Set((project?.working_weekdays ?? [1, 2, 3, 4, 5, 6]).map(String));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Project code" name="code" required hint="Unique within the organization, e.g. RRT-A"><Input name="code" defaultValue={project?.code} required maxLength={40} /></Field>
      <Field label="Project name" name="name" required><Input name="name" defaultValue={project?.name} required minLength={2} maxLength={160} /></Field>
      <Field label="Location" name="location"><Input name="location" defaultValue={project?.location ?? ""} maxLength={200} /></Field>
      <Field label="Construction type" name="construction_type">
        <Select name="construction_type" defaultValue={project?.construction_type ?? ""}>
          <option value="">Not specified</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
          {project?.construction_type && !TYPES.includes(project.construction_type) && <option>{project.construction_type}</option>}
        </Select>
      </Field>
      <Field label="Planned start" name="planned_start" required><Input name="planned_start" type="date" defaultValue={project?.planned_start} required /></Field>
      <Field label="Planned finish" name="planned_finish" required><Input name="planned_finish" type="date" defaultValue={project?.planned_finish} required /></Field>
      <Field label="Budget" name="budget" hint="Optional. Used for display only; cost forecasting is not performed."><Input name="budget" inputMode="decimal" defaultValue={project?.budget ?? ""} /></Field>
      <Field label="Currency" name="currency" required hint="3-letter code"><Input name="currency" defaultValue={project?.currency ?? "INR"} required minLength={3} maxLength={3} /></Field>
      <Field label="Time zone" name="timezone" required hint="IANA name. Decides what 'today' means for reports."><Input name="timezone" defaultValue={project?.timezone ?? "Asia/Kolkata"} required /></Field>
      <Field label="Project manager" name="manager_id">
        <Select name="manager_id" defaultValue={project?.manager_id ?? ""}>
          <option value="">Me / not assigned</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="label">Working days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map(([v, l]) => (
            <label key={v} className="inline-flex min-h-[40px] items-center gap-2 rounded border border-steel-300 bg-white px-3 text-sm">
              <input type="checkbox" name="weekday" value={v} defaultChecked={days.has(v)} /> {l}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-mute">Used for planned progress, critical path and forecasts. Add holidays in project settings.</p>
      </fieldset>
      <div className="sm:col-span-2"><Field label="Description" name="description"><Textarea name="description" defaultValue={project?.description ?? ""} maxLength={2000} /></Field></div>
    </div>
  );
}
