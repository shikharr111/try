"use client";
import React, { useEffect, useState } from "react";

/* Small site-wide helpers: UTM capture, cookie notice, contact message sender. */

const UTM_KEY = "infratrack-utm";
const COOKIE_KEY = "infratrack-cookie-notice";
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** Remembers where a visitor came from (the first ?utm_… link they used). Returns what is stored, or null. */
export function captureUtm(): Record<string, string> | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    for (const k of UTM_FIELDS) { const v = q.get(k); if (v) found[k] = v.slice(0, 100); }
    if (Object.keys(found).length && !window.localStorage.getItem(UTM_KEY)) {
      window.localStorage.setItem(UTM_KEY, JSON.stringify({ ...found, landing: window.location.pathname, at: new Date().toISOString() }));
    }
    const raw = window.localStorage.getItem(UTM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Sends a contact message to the contact_messages table (insert-only for everyone, see the migration). */
export async function sendContactMessage(p: { name: string; email: string; message: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, error: "Messages are not set up on this site yet." };
  try {
    const res = await fetch(`${url}/rest/v1/contact_messages`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: p.name.trim(), email: p.email.trim(), message: p.message.trim(), utm: captureUtm() }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 404 || res.status === 401 || res.status === 403) return { ok: false, error: "Messages are not set up on this site yet. Please try again later." };
    return { ok: false, error: "Could not send your message. Check your details and try again." };
  } catch { return { ok: false, error: "No connection. Check your internet and try again." }; }
}

/** A plain cookie notice. The site sets only the sign-in cookie; the rest is remembered choices in this browser. */
export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!window.localStorage.getItem(COOKIE_KEY)) setShow(true); } catch { /* storage blocked: stay hidden */ } }, []);
  if (!show) return null;
  const close = () => { try { window.localStorage.setItem(COOKIE_KEY, "1"); } catch { /* ignore */ } setShow(false); };
  return (
    <div role="region" aria-label="Cookie notice" className="no-print" style={{
      position: "fixed", left: 16, bottom: 16, zIndex: 90, maxWidth: 360, padding: "14px 16px", borderRadius: 10,
      background: "#0A0A0A", color: "#F5F5F5", border: "1px solid #262626", boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
      fontFamily: "'Manrope','Segoe UI',system-ui,sans-serif", fontSize: 13, lineHeight: 1.55,
    }}>
      This site uses a cookie only to keep you signed in, and your browser remembers settings such as the theme. No advertising cookies. <a href="/privacy" style={{ color: "#F0A93A" }}>Privacy</a>
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={close} style={{ background: "#F0A93A", color: "#1B1204", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Got it</button>
      </div>
    </div>
  );
}

/** A small round spinner for loading states. */
export function Spinner({ size = 28, color = "#F0A93A" }: { size?: number; color?: string }) {
  return (
    <span role="status" aria-label="Loading" style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `3px solid ${color}33`, borderTopColor: color, animation: "itSpin 0.8s linear infinite" }}>
      <style>{`@keyframes itSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
