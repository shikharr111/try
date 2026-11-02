import { redirect } from "next/navigation";
import { updatePassword } from "@/app/actions/auth";
import { Field, Flash, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?err=" + encodeURIComponent("The reset link is invalid or has expired. Request a new one."));
  return (
    <>
      <h1 className="mb-4">Choose a new password</h1>
      <Flash err={sp.err} />
      <form action={updatePassword} className="space-y-4">
        <Field label="New password" name="password" required hint="At least 10 characters."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <Field label="Confirm new password" name="confirm" required><Input name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <button className="btn btn-primary w-full" type="submit">Update password</button>
      </form>
    </>
  );
}
