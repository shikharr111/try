/**
 * UI-side permission helper. It MIRRORS the Row Level Security policies so the interface can hide or
 * disable actions the database would refuse anyway. It is NOT a security boundary: RLS and the
 * integrity triggers (supabase/migrations/*) are authoritative and are tested in supabase/tests.
 */
export type OrgRole = "org_admin" | "project_manager" | "site_engineer";
export type ProjectRole = "project_manager" | "site_engineer";

export interface ProjectAccess {
  read: boolean;
  /** edit plan, baseline, activities, members, milestones, project settings */
  manage: boolean;
  /** create/edit own daily reports, log delay events, import reports, upload attachments */
  report: boolean;
  /** approve/reject submitted reports, confirm delay events, approve recovery plans & baselines */
  review: boolean;
  runAiAnalysis: boolean;
  viewAudit: boolean;
}

export function projectAccess(orgRole: OrgRole | null, projectRole: ProjectRole | null): ProjectAccess {
  const isAdmin = orgRole === "org_admin";
  const read = isAdmin || projectRole !== null;
  const manage = isAdmin || projectRole === "project_manager";
  return { read, manage, report: read, review: manage, runAiAnalysis: manage, viewAudit: manage };
}

export const canCreateProject = (orgRole: OrgRole | null) => orgRole === "org_admin" || orgRole === "project_manager";
export const canDeleteProject = (orgRole: OrgRole | null) => orgRole === "org_admin";
export const canManageOrganization = (orgRole: OrgRole | null) => orgRole === "org_admin";

export type ReportStatus = "draft" | "submitted" | "approved" | "rejected";

/** Valid status transitions, mirroring public.daily_report_guard. */
export function reportActions(args: {
  status: ReportStatus;
  isReporter: boolean;
  access: ProjectAccess;
}): { edit: boolean; submit: boolean; recall: boolean; approve: boolean; reject: boolean; delete: boolean } {
  const { status, isReporter, access } = args;
  const owner = isReporter || access.manage;
  return {
    edit: status !== "approved" && owner && access.read,
    submit: (status === "draft" || status === "rejected") && owner && access.read,
    recall: status === "submitted" && isReporter,
    approve: status === "submitted" && access.review,
    reject: (status === "submitted" || status === "approved") && access.review,
    delete: (status === "draft" || status === "rejected") && owner,
  };
}
