"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

/**
 * Toast notification for the one-line result messages that server actions put in the URL (?ok= / ?err=).
 * Success toasts close themselves after 6 s; errors stay until dismissed. The query parameter is removed from the
 * address bar after showing so a reload or shared link does not replay the message.
 * UNVERIFIED in a browser.
 */
export function Toast({ ok, err }: { ok?: string; err?: string }) {
  const message = err ?? ok;
  const isErr = !!err;
  const [open, setOpen] = useState(!!message);

  useEffect(() => {
    setOpen(!!message);
    if (!message) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("ok") || u.searchParams.has("err")) {
        u.searchParams.delete("ok");
        u.searchParams.delete("err");
        window.history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
      }
    } catch { /* non-critical */ }
    if (isErr) return;
    const t = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(t);
  }, [message, isErr]);

  if (!message || !open) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:justify-end">
      <div role={isErr ? "alert" : "status"} aria-live={isErr ? "assertive" : "polite"}
        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg animate-toast-in ${isErr ? "border-bad/40 bg-bad-soft text-bad" : "border-ok/40 bg-ok-soft text-ok"}`}>
        <Icon name={isErr ? "alert" : "check"} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss message" className="-mr-1 rounded p-1 hover:bg-black/5"><Icon name="close" size={16} /></button>
      </div>
    </div>
  );
}
