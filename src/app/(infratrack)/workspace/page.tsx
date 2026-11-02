import type { Metadata } from "next";
import { requireUser } from "@/lib/server/session";
import WorkspaceClient from "./workspace-client";

export const metadata: Metadata = { title: "Workspace" };

/** Signed-in only (requireUser redirects to /login). The server passes the verified user to the client workspace. */
export default async function WorkspacePage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = (profile?.full_name || meta.full_name || meta.name || (user.email ?? "").split("@")[0] || "User").trim();
  return <WorkspaceClient user={{ id: user.id, email: user.email ?? "", name }} />;
}
