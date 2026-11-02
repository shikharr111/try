import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { Sidebar } from "@/components/sidebar";
import { Topbar, type NotificationItem } from "@/components/topbar";
import { getMemberships, requireUser } from "@/lib/server/session";
import { isDemoMode } from "@/lib/server/env";
import { fmtDate } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships(supabase, user.id);
  if (memberships.length === 0) redirect("/onboarding");

  const [{ data: projects }, { data: profile }, { data: pms }] = await Promise.all([
    supabase.from("projects").select("id, code, name").order("code").limit(200),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("project_memberships").select("project_id").eq("user_id", user.id).eq("role", "project_manager").limit(1),
  ]);
  const list = (projects ?? []) as { id: string; code: string; name: string }[];
  const code = new Map(list.map((p) => [p.id, p.code]));
  const isManager = memberships.some((m) => m.role !== "site_engineer") || (pms ?? []).length > 0;
  const demo = isDemoMode() || memberships.some((m) => m.organization.is_demo);

  // Notifications are derived from live rows the user can already see (RLS applies); nothing is stored or simulated.
  const [awaiting, delays, returned, drafts] = await Promise.all([
    isManager ? supabase.from("daily_reports").select("id, project_id, report_date").eq("status", "submitted").order("report_date", { ascending: false }).limit(4) : Promise.resolve({ data: [] }),
    isManager ? supabase.from("delay_events").select("id, project_id, start_date, description").eq("review_status", "unreviewed").order("start_date", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
    supabase.from("daily_reports").select("id, project_id, report_date, review_comment").eq("status", "rejected").eq("reporter_id", user.id).limit(4),
    supabase.from("daily_reports").select("id, project_id, report_date").eq("status", "draft").eq("reporter_id", user.id).limit(3),
  ]);
  const notes: NotificationItem[] = [
    ...((awaiting.data ?? []) as { id: string; project_id: string; report_date: string }[]).map((r) => ({ id: `a${r.id}`, href: `/projects/${r.project_id}/reports/${r.id}`, title: "Report awaiting your review", detail: `${code.get(r.project_id) ?? ""} · ${fmtDate(r.report_date)}` })),
    ...((delays.data ?? []) as { id: string; project_id: string; start_date: string; description: string }[]).map((d) => ({ id: `d${d.id}`, href: `/projects/${d.project_id}/delays`, title: "Delay event to review", detail: `${code.get(d.project_id) ?? ""} · ${d.description}` })),
    ...((returned.data ?? []) as { id: string; project_id: string; report_date: string; review_comment: string | null }[]).map((r) => ({ id: `r${r.id}`, href: `/projects/${r.project_id}/reports/${r.id}`, title: "Your report was returned", detail: `${code.get(r.project_id) ?? ""} · ${fmtDate(r.report_date)}${r.review_comment ? ` · ${r.review_comment}` : ""}` })),
    ...((drafts.data ?? []) as { id: string; project_id: string; report_date: string }[]).map((r) => ({ id: `f${r.id}`, href: `/projects/${r.project_id}/reports/${r.id}`, title: "Draft report not submitted", detail: `${code.get(r.project_id) ?? ""} · ${fmtDate(r.report_date)}` })),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar projects={list} orgs={memberships.map((m) => ({ id: m.organization_id, name: m.organization.name }))}
        canCreate={memberships.some((m) => m.role !== "site_engineer")} isAdmin={memberships.some((m) => m.role === "org_admin")} />
      <div className="min-w-0 flex-1">
        {demo && (
          <div role="note" className="no-print border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-warn">
            Demo data: fictional projects for evaluation. Not real site records.
          </div>
        )}
        <Topbar projects={list} notifications={notes} userName={profile?.full_name || user.email || "Signed in"} userEmail={user.email ?? ""} signOut={signOut} />
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
