import { Alert, Card, LinkTabs, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/session";
import { ACCOUNT_TABS } from "../tabs";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const rules = [
    ["Reports awaiting review", "Managers: submitted daily reports that have not been approved or returned."],
    ["Delay events to review", "Managers: delay events still marked unreviewed."],
    ["Returned reports", "Reporters: reports a manager sent back with a comment."],
    ["Draft reports", "Reporters: reports you started but have not submitted."],
  ];
  return (
    <>
      <PageHeader title="Notifications" subtitle="What appears in the bell menu at the top of every page." />
      <LinkTabs tabs={ACCOUNT_TABS} active="notifications" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="In-app notifications (always on)">
          <ul className="space-y-3 text-sm">{rules.map(([t, d]) => <li key={t}><div className="font-medium">{t}</div><div className="text-ink-mute">{d}</div></li>)}</ul>
          <p className="mt-3 text-xs text-ink-mute">These are computed from live data each time a page loads; nothing is stored, so there is nothing to mark as read.</p>
        </Card>
        <Card title="Email and push preferences">
          <Alert tone="info" title="Not available yet">Email and push notifications need a delivery service and a preferences table that this version does not include, so these options are deliberately not shown as switches. They are listed as a limitation rather than simulated.</Alert>
          <div className="mt-3 space-y-2 opacity-60">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled /> Email me when a report is returned</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled /> Daily digest of delayed projects</label>
          </div>
        </Card>
      </div>
    </>
  );
}
