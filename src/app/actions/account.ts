"use server";
import { revalidatePath } from "next/cache";
import { FormReader } from "@/lib/forms";
import { friendlyDbError, redirectWith } from "@/lib/server/flash";
import { requireUser } from "@/lib/server/session";

/** Account actions act only on the signed-in user (RLS policy profiles_update_own enforces it again). UNVERIFIED live. */
export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const r = new FormReader(formData);
  const name = r.text("full_name", "Name", { required: true, max: 120 });
  if (!r.ok) redirectWith("/account", "err", Object.values(r.errors)[0]);
  const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
  if (error) redirectWith("/account", "err", friendlyDbError(error));
  await supabase.auth.updateUser({ data: { full_name: name } }); // keep auth metadata in step; failure is non-critical
  revalidatePath("/", "layout");
  redirectWith("/account", "ok", "Profile updated.");
}

export async function changePassword(formData: FormData) {
  const { supabase, user } = await requireUser();
  const r = new FormReader(formData);
  const next = r.password("password", "New password");
  const current = String(formData.get("current") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!r.ok) redirectWith("/account/security", "err", Object.values(r.errors)[0]);
  if (!current) redirectWith("/account/security", "err", "Enter your current password.");
  if (next !== confirm) redirectWith("/account/security", "err", "The two new passwords do not match.");
  if (next === current) redirectWith("/account/security", "err", "Choose a password different from the current one.");
  // Re-verify the current password so a hijacked open session cannot silently change it.
  const verify = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: current });
  if (verify.error) redirectWith("/account/security", "err", "The current password is incorrect.");
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) redirectWith("/account/security", "err", "Could not update the password. Choose a different one and try again.");
  redirectWith("/account/security", "ok", "Password changed.");
}

export async function signOutOtherSessions() {
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  redirectWith("/account/security", error ? "err" : "ok", error ? "Could not sign out other devices." : "Signed out of all other devices.");
}
