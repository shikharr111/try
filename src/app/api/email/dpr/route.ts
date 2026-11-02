import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDprPayload, renderDprEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST JSON { projectName, date, sections } -> e-mails the Daily Progress Report to the SIGNED-IN user's own login
 * address. The recipient is never taken from the request, so this cannot be used to send mail to anyone else.
 */
export async function POST(req: Request) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ code: "bad_request" }, { status: 415 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  const payload = parseDprPayload(await req.json().catch(() => null));
  if (!payload) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  const mail = renderDprEmail(payload);
  const r = await sendEmail({ to: user.email, ...mail });
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ code: r.code }, { status: r.code === "not_configured" ? 503 : 502 });
}
