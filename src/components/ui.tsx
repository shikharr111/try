import Link from "next/link";
import type { ReactNode, ComponentProps } from "react";
import { HEALTH_LABELS, REPORT_STATUS_LABELS } from "@/lib/format";
import { Toast } from "./toast";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-steel-200 px-4 py-3">
          <h2>{title}</h2>
          {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tabular-nums", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-mute">{hint}</div>}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-steel-100 text-ink-soft border-steel-300",
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  bad: "bg-bad-soft text-bad border-bad/30",
  info: "bg-info-soft text-info border-info/30",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

const HEALTH_TONE: Record<string, Tone> = { on_track: "ok", at_risk: "warn", delayed: "bad", unknown: "neutral" };
const HEALTH_ICON: Record<string, string> = { on_track: "✓", at_risk: "!", delayed: "▲", unknown: "?" };
export function HealthBadge({ status }: { status: string }) {
  return (
    <Badge tone={HEALTH_TONE[status] ?? "neutral"}>
      <span aria-hidden>{HEALTH_ICON[status] ?? "?"}</span>
      {HEALTH_LABELS[status] ?? status}
    </Badge>
  );
}
const REPORT_TONE: Record<string, Tone> = { draft: "neutral", submitted: "info", approved: "ok", rejected: "warn" };
export function ReportStatusBadge({ status }: { status: string }) {
  return <Badge tone={REPORT_TONE[status] ?? "neutral"}>{REPORT_STATUS_LABELS[status] ?? status}</Badge>;
}

/** Result message of the last action, shown as a toast (see components/toast.tsx). */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <Toast ok={ok} err={err} />;
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={cx("rounded border px-3 py-2 text-sm", TONES[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-steel-300 bg-white px-4 py-8 text-center">
      <div className="font-medium">{title}</div>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-mute">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Field({ label, name, error, hint, required, children }: { label: string; name: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
        {required && <span className="text-bad" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="mt-1 text-xs text-ink-mute">{hint}</p>}
      {error && <p id={`${name}-err`} className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
export function Input({ error, ...p }: ComponentProps<"input"> & { error?: string }) {
  return <input {...p} id={p.id ?? p.name} className={cx("input", p.className)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${p.name}-err` : undefined} />;
}
export function Select({ error, children, ...p }: ComponentProps<"select"> & { error?: string }) {
  return (
    <select {...p} id={p.id ?? p.name} className={cx("input", p.className)} aria-invalid={error ? true : undefined}>
      {children}
    </select>
  );
}
export function Textarea({ error, ...p }: ComponentProps<"textarea"> & { error?: string }) {
  return <textarea {...p} id={p.id ?? p.name} rows={p.rows ?? 3} className={cx("input", p.className)} aria-invalid={error ? true : undefined} />;
}

export function LinkButton({ href, variant = "secondary", children, className }: { href: string; variant?: "primary" | "secondary" | "ghost"; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("btn", `btn-${variant}`, className)}>
      {children}
    </Link>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

/** Planned vs actual bar with a text equivalent for assistive tech and print. */
export function ProgressBar({ planned, actual }: { planned: number | null; actual: number | null }) {
  const a = actual === null ? 0 : Math.min(100, Math.max(0, actual));
  const p = planned === null ? null : Math.min(100, Math.max(0, planned));
  return (
    <div role="img" aria-label={`Actual ${actual ?? "unknown"} percent, planned ${planned ?? "unknown"} percent`} className="min-w-[110px]">
      <div className="relative h-2.5 w-full rounded-sm bg-steel-200">
        <div className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${a}%` }} />
        {p !== null && <div className="absolute -inset-y-0.5 w-0.5 bg-ink" style={{ left: `calc(${p}% - 1px)` }} title={`Planned ${p}%`} />}
      </div>
    </div>
  );
}

/** Loading placeholder block. Decorative: the surrounding region announces loading via aria-busy. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded bg-steel-200", className)} />;
}

/** Inline explanatory hint (native tooltip + keyboard-reachable text alternative). */
export function Hint({ text }: { text: string }) {
  return <span tabIndex={0} role="note" aria-label={text} title={text} className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-steel-400 text-[10px] font-semibold text-ink-mute">?</span>;
}

/** Tabs rendered as links (state lives in the URL, so they work without JavaScript). */
export function LinkTabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav aria-label="Section" className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-steel-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}
          className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm no-underline", t.key === active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-mute hover:text-ink")}>{t.label}</Link>
      ))}
    </nav>
  );
}
