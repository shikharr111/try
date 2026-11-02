import { getProjectContext } from "@/lib/server/session";
import { Badge } from "@/components/ui";

const STATUS: Record<string, string> = { planning: "Planning", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // notFound() inside when RLS hides the project: guessed ids look identical to missing ones.
  const { project, orgRole, projectRole } = await getProjectContext(projectId);
  const role = orgRole === "org_admin" ? "Organization admin" : projectRole === "project_manager" ? "Project manager" : projectRole === "site_engineer" ? "Site engineer" : "Read access";
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
        <span className="font-mono text-ink-soft">{project.code}</span>
        {project.is_demo && <Badge tone="warn">Demo data</Badge>}
        <Badge tone={project.status === "active" ? "ok" : "neutral"}>{STATUS[project.status] ?? project.status}</Badge>
        <span className="ml-auto">Your role: {role}</span>
      </div>
      {children}
    </>
  );
}
