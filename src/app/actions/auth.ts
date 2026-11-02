"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormReader, safeRedirectPath } from "@/lib/forms";
import { siteUrl } from "@/lib/server/env";
import { redirectWith } from "@/lib/server/flash";

/** Where people land after signing in. */
const HOME = "/workspace";

export async function signIn(formData: FormData) {
  const r = new FormReader(formData);
  const email = r.email("email");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""), HOME);
  if (!email || !password) redirectWith("/login", "err", "Enter your email and password.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // One generic message for every failure: never reveal whether an account exists.
  if (error) redirectWith(`/login${next !== HOME ? `?next=${encodeURIComponent(next)}` : ""}`, "err", "Incorrect email or password, or the email is not confirmed yet.");
  redirect(next);
}

export async function signUp(formData: FormData) {
  const r = new FormReader(formData);
  const fullName = r.text("full_name", "Name", { required: true, max: 120 });
  const email = r.email("email");
  const password = r.password("password");
  if (!r.ok) redirectWith("/signup", "err", Object.values(r.errors)[0]);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${HOME}` },
  });
  if (error) redirectWith("/signup", "err", "Could not create the account. If you already registered, sign in or reset your password.");
  if (data.session) redirect(HOME);
  redirectWith("/login", "ok", "Account created. Check your email to confirm the address, then sign in.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const r = new FormReader(formData);
  const email = r.email("email");
  if (!r.ok) redirectWith("/forgot-password", "err", r.errors.email);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
  // Same answer whether or not the address is registered.
  redirectWith("/login", "ok", "If that email is registered, a password reset link has been sent.");
}

export async function updatePassword(formData: FormData) {
  const r = new FormReader(formData);
  const password = r.password("password", "New password");
  const confirm = String(formData.get("confirm") ?? "");
  if (!r.ok) redirectWith("/reset-password", "err", r.errors.password);
  if (password !== confirm) redirectWith("/reset-password", "err", "The two passwords do not match.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirectWith("/login", "err", "The reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirectWith("/reset-password", "err", "Could not update the password. Choose a different one and try again.");
  redirectWith(HOME, "ok", "Password updated.");
}
