import { redirect } from "next/navigation";
import { createOrganization } from "@/app/actions/org";
import { Field, Flash, Input } from "@/components/ui";
import { getMemberships, requireUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your organization" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { supabase, user } = await requireUser();
  if ((await getMemberships(supabase, user.id)).length > 0) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="card p-6">
        <h1 className="mb-1">Set up your organization</h1>
        <p className="mb-4 text-sm text-ink-mute">
          You are not a member of any organization yet. Create one (you become its admin), or ask an organization admin to add the email address you signed up with.
        </p>
        <Flash err={sp.err} />
        <form action={createOrganization} className="space-y-4">
          <Field label="Organization name" name="name" required><Input name="name" required minLength={2} maxLength={120} /></Field>
          <button className="btn btn-primary w-full" type="submit">Create organization</button>
        </form>
      </div>
    </main>
  );
}
