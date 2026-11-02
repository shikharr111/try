import "server-only";
import { resendRequest } from "./render";

export type SendResult = { ok: true } | { ok: false; code: "not_configured" | "rejected" | "network"; status?: number };

/**
 * Sends one email through Resend (https://resend.com). Needs RESEND_API_KEY on the server. EMAIL_FROM is optional;
 * the default sender (onboarding@resend.dev) can only deliver to the e-mail address the Resend account was created with.
 */
export async function sendEmail(o: { to: string; subject: string; text: string; html: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, code: "not_configured" };
  const from = process.env.EMAIL_FROM || "InfraTrack <onboarding@resend.dev>";
  try {
    const req = resendRequest(key, from, o.to, o);
    const res = await fetch(req.url, req.init);
    if (res.ok) return { ok: true };
    return { ok: false, code: "rejected", status: res.status };
  } catch {
    return { ok: false, code: "network" };
  }
}
