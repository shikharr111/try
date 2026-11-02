import { Alert, PageHeader } from "@/components/ui";
import { ReportForm, type ActivityOption } from "@/components/report-form";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";

export const dynamic = "force-dynamic";

export default async function NewReport({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, project, access } = await getProjectContext(projectId);
  const b = await loadProjectBundle(supabase, project, null);
  if (!access.report) return <Alert tone="bad">You do not have permission to report on this project.</Alert>;
  const activities: ActivityOption[] = b.baseline.map((r) => ({ id: r.activity_id, code: r.code, name: r.name, unit: r.unit, plannedQty: null, plannedWorkers: r.planned_workers === null ? null : String(r.planned_workers) }));
  return (
    <>
      <PageHeader title="New daily report" subtitle={`Report date defaults to today (${project.timezone}). One report per date, shift and reporter; an activity can only be reported once per date and shift.`} />
      {activities.length === 0 ? <Alert tone="warn" title="No activities">An approved baseline with activities is needed before reports can be created.</Alert> : (
        <ReportForm projectId={project.id} activities={activities} maxDate={b.today} editableDate
          initial={{ header: { report_date: b.today, shift: "day", weather: "", site_conditions: "", observations: "" }, lines: [], workforce: [], equipment: [] }} />
      )}
    </>
  );
}
