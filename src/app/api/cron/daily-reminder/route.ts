import { NextResponse } from "next/server";
import { isCronAuthorized, renderReminderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called every evening by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
 * Sends a short reminder (no project data) to REMINDER_TO. Does nothing unless both are configured.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  const to = (process.env.REMINDER_TO || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ code: "no_recipient" }, { status: 503 });
  const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!site) return NextResponse.json({ code: "no_site_url" }, { status: 503 });
  const r = await sendEmail({ to, ...renderReminderEmail(site) });
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ code: r.code }, { status: r.code === "not_configured" ? 503 : 502 });
}
