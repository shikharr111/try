/** Pure helpers: build the email bodies and validate what the browser sends. No network, no secrets. */

export type DprSection = { title: string; lines: string[] };
export type DprPayload = { projectName: string; date: string; sections: DprSection[] };

const MAX_SECTIONS = 20;
const MAX_LINES = 200;
const MAX_LINE = 500;
const MAX_TITLE = 80;

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

/** Returns a safe payload or null when the shape is wrong. */
export function parseDprPayload(raw: unknown): DprPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const projectName = clean(r.projectName, 120);
  const date = clean(r.date, 10);
  if (!projectName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Array.isArray(r.sections) || r.sections.length > MAX_SECTIONS) return null;
  let lines = 0;
  const sections: DprSection[] = [];
  for (const s of r.sections) {
    if (!s || typeof s !== "object") return null;
    const sec = s as Record<string, unknown>;
    const title = clean(sec.title, MAX_TITLE);
    if (!title || !Array.isArray(sec.lines)) return null;
    const ls = sec.lines.map((l) => clean(l, MAX_LINE)).filter(Boolean);
    lines += ls.length;
    if (lines > MAX_LINES) return null;
    sections.push({ title, lines: ls });
  }
  return { projectName, date, sections };
}

const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function renderDprEmail(p: DprPayload): { subject: string; text: string; html: string } {
  const subject = `Daily Progress Report — ${p.projectName} — ${dmy(p.date)}`;
  const body = p.sections.length
    ? p.sections.flatMap((s) => [s.title, ...s.lines.map((l) => `  - ${l}`), ""])
    : ["Nothing was entered for this date."];
  const text = ["DAILY PROGRESS REPORT", p.projectName, `Date: ${dmy(p.date)}`, "", ...body].join("\n");
  const htmlSections = p.sections.length
    ? p.sections
        .map(
          (s) =>
            `<h3 style="margin:18px 0 6px;font-size:13px;letter-spacing:.04em;color:#b8741a">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines
              .map((l) => `<li style="margin:3px 0">${esc(l)}</li>`)
              .join("")}</ul>`
        )
        .join("")
    : `<p>Nothing was entered for this date.</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1f23;max-width:640px"><h2 style="margin:0 0 4px">Daily Progress Report</h2><div style="color:#565d66">${esc(
    p.projectName
  )} · ${esc(dmy(p.date))}</div>${htmlSections}<p style="margin-top:24px;color:#737b85;font-size:12px">Sent from InfraTrack at your request.</p></div>`;
  return { subject, text, html };
}

export function renderReminderEmail(siteUrl: string): { subject: string; text: string; html: string } {
  const link = `${siteUrl.replace(/\/+$/, "")}/workspace`;
  const subject = "InfraTrack — enter today's site data";
  const text = `Time to enter today's site data in InfraTrack (workers, machines, progress, weather, cost, safety).\n\nOpen: ${link}\n\nYou get this reminder every evening at 8 PM.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1f23;max-width:560px"><h2 style="margin:0 0 8px">Enter today's site data</h2><p>Workers, machines, progress, weather, cost and safety for today.</p><p><a href="${esc(
    link
  )}" style="display:inline-block;background:#e8742a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Open InfraTrack</a></p><p style="color:#737b85;font-size:12px">You get this reminder every evening at 8 PM.</p></div>`;
  return { subject, text, html };
}

/** Constant-time check of "Authorization: Bearer <secret>" for the cron route. Fails closed when no secret is set. */
export function isCronAuthorized(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** The exact HTTP request sent to Resend (kept pure so it can be tested without a network or a key). */
export function resendRequest(key: string, from: string, to: string, mail: { subject: string; text: string; html: string }): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
    },
  };
}
