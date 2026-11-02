"use client";
import Link from "next/link";
import { useEffect } from "react";

/** Error boundary for the signed-in app. The raw error message is never shown (it may contain internals). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto mt-12 max-w-lg rounded-md border border-bad/30 bg-white p-6 text-center">
      <h1 className="mb-2">Something went wrong</h1>
      <p className="text-sm text-ink-mute">This page could not be loaded. Your data has not been changed. Try again, or go back to the dashboard.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-mute">Reference: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
      </div>
    </div>
  );
}
