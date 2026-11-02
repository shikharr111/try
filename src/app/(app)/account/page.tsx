import { Badge, Card, Field, Flash, Input, LinkTabs, PageHeader } from "@/components/ui";
import { updateProfile } from "@/app/actions/account";
import { aiConfig, isDemoMode, siteUrl } from "@/lib/server/env";
import { getMemberships, requireUser } from "@/lib/server/session";
import { ACCOUNT_TABS } from "./tabs";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";
const ROLE: Record<string, string> = { org_admin: "Organization admin", project_manager: "Project manager", site_engineer: "Site engineer" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [{ data: profile }, memberships] = await Promise.all([supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(), getMemberships(supabase, user.id)]);
  const isAdmin = memberships.some((m) => m.role === "org_admin");
  const ai = aiConfig();
  return (
    <>
      <PageHeader title="Account" subtitle="Your profile, sign-in security and notifications." />
      <LinkTabs tabs={ACCOUNT_TABS} active="profile" />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <form action={updateProfile} className="space-y-3">
            <Field label="Full name" name="full_name" required><Input name="full_name" defaultValue={profile?.full_name ?? ""} required maxLength={120} /></Field>
            <Field label="Email" name="email" hint="Your sign-in email cannot be changed here."><Input name="email" defaultValue={profile?.email ?? user.email ?? ""} disabled /></Field>
            <button className="btn btn-primary">Save profile</button>
          </form>
        </Card>
        <Card title="Your access">
          <ul className="space-y-2 text-sm">
            {memberships.map((m) => <li key={m.organization_id} className="flex items-center justify-between"><span>{m.organization.name}</span><Badge tone="info">{ROLE[m.role] ?? m.role}</Badge></li>)}
          </ul>
          <p className="mt-3 text-xs text-ink-mute">Roles are changed by an organization admin on the Organization page. Project access is set in each project&apos;s settings.</p>
        </Card>
        {isAdmin && (
          <Card title="Application configuration (admins)" className="lg:col-span-2">
            <p className="mb-3 text-sm text-ink-mute">Read-only status of this deployment. Secret values are never displayed; change them in your hosting provider&apos;s environment settings.</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs uppercase text-ink-mute">AI analysis</dt><dd>{ai ? <Badge tone="ok">Configured</Badge> : <Badge tone="warn">Not configured</Badge>}</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">AI daily limit / project</dt><dd>{ai ? ai.dailyLimit : "—"}</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">Demo mode</dt><dd>{isDemoMode() ? <Badge tone="warn">On</Badge> : <Badge>Off</Badge>}</dd></div>
              <div><dt className="text-xs uppercase text-ink-mute">Site URL</dt><dd className="break-all">{siteUrl()}</dd></div>
            </dl>
          </Card>
        )}
      </div>
    </>
  );
}
