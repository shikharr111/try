import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { Field, Flash, Input } from "@/components/ui";

export const metadata = { title: "Reset password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="mb-4">Reset your password</h1>
      <Flash err={sp.err} />
      <form action={requestPasswordReset} className="space-y-4">
        <Field label="Email" name="email" required><Input name="email" type="email" autoComplete="email" required /></Field>
        <button className="btn btn-primary w-full" type="submit">Send reset link</button>
      </form>
      <p className="mt-4 text-sm"><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
