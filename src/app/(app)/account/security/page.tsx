import { Alert, Card, Field, Flash, Input, LinkTabs, PageHeader } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { changePassword, signOutOtherSessions } from "@/app/actions/account";
import { requireUser } from "@/lib/server/session";
import { ACCOUNT_TABS } from "../tabs";

export const metadata = { title: "Account security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireUser();
  return (
    <>
      <PageHeader title="Account security" subtitle="Change your password and manage signed-in devices." />
      <LinkTabs tabs={ACCOUNT_TABS} active="security" />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Change password">
          <form action={changePassword} className="space-y-3">
            <Field label="Current password" name="current" required><Input name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" name="password" required hint="At least 10 characters."><Input name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
            <Field label="Confirm new password" name="confirm" required><Input name="confirm" type="password" autoComplete="new-password" required minLength={10} /></Field>
            <button className="btn btn-primary">Change password</button>
          </form>
        </Card>
        <Card title="Devices and sessions">
          <p className="mb-3 text-sm text-ink-mute">If you signed in on a shared or lost device, sign out everywhere else. This device stays signed in.</p>
          <ConfirmForm action={signOutOtherSessions} label="Sign out other devices" title="Sign out other devices?" confirmLabel="Sign out others" message="Every other browser or phone signed in to your account will need to sign in again." />
          <div className="mt-4"><Alert tone="info" title="Two-factor authentication">Not available in this app yet. It can be enabled through Supabase Auth settings once a sign-in screen for the second step is added; it is not simulated here.</Alert></div>
        </Card>
      </div>
    </>
  );
}
