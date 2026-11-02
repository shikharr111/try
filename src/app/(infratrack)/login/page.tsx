import type { Metadata } from "next";
import { safeRedirectPath } from "@/lib/forms";
import LoginClient from "./login-client";

export const metadata: Metadata = { title: "Sign in" };

/** Sign-in / sign-up screen. Signed-in visitors never see it: the middleware sends them to /workspace. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; next?: string; mode?: string }> }) {
  const sp = await searchParams;
  const notice = sp.err ? { kind: "err" as const, text: sp.err.slice(0, 300) } : sp.ok ? { kind: "ok" as const, text: sp.ok.slice(0, 300) } : null;
  return <LoginClient next={safeRedirectPath(sp.next, "/workspace")} startMode={sp.mode === "register" ? "register" : "login"} notice={notice} />;
}
