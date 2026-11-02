"use client";
import { useRef, type ReactNode } from "react";

/**
 * Button that opens a native <dialog> for confirmation, then submits the server action.
 * Works with keyboard (Esc closes, focus is trapped by the browser's modal dialog).
 */
export function ConfirmForm({
  action,
  fields,
  label,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`btn ${danger ? "btn-danger" : "btn-secondary"}`} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog ref={ref} className="w-[min(92vw,28rem)] rounded-md border border-steel-300 p-0 shadow-xl backdrop:bg-black/40" aria-labelledby="confirm-title">
        <form action={action} className="p-5">
          {Object.entries(fields ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <h2 id="confirm-title" className="mb-2">{title}</h2>
          <div className="text-sm text-ink-soft">{message}</div>
          {children && <div className="mt-3">{children}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>Cancel</button>
            <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`}>{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
