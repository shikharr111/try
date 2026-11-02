import { isValidISODate } from "./calc/dates";
import { parseDecimalCell } from "./import/validate";

/**
 * Server-side form parsing. Every server action validates its input here; client-side validation is only
 * a convenience. Errors are collected per field so forms can show them next to the inputs.
 */
export type FieldErrors = Record<string, string>;

export class FormReader {
  readonly errors: FieldErrors = {};
  constructor(private readonly data: FormData | URLSearchParams | Record<string, unknown>) {}

  private raw(key: string): string {
    const d = this.data as { get?: (k: string) => unknown } & Record<string, unknown>;
    const v = typeof d.get === "function" ? d.get(key) : d[key];
    return typeof v === "string" ? v.trim() : "";
  }
  private fail(key: string, msg: string) {
    this.errors[key] ??= msg;
  }

  text(key: string, label: string, opts: { required?: boolean; max?: number; min?: number } = {}): string {
    const v = this.raw(key);
    if (v === "") {
      if (opts.required) this.fail(key, `${label} is required`);
      return "";
    }
    if (opts.min && v.length < opts.min) this.fail(key, `${label} must be at least ${opts.min} characters`);
    if (v.length > (opts.max ?? 500)) this.fail(key, `${label} must be at most ${opts.max ?? 500} characters`);
    return v;
  }
  optionalText(key: string, label: string, max = 2000): string | null {
    const v = this.text(key, label, { max });
    return v === "" ? null : v;
  }
  date(key: string, label: string, required = true): string | null {
    const v = this.raw(key);
    if (v === "") {
      if (required) this.fail(key, `${label} is required`);
      return null;
    }
    if (!isValidISODate(v)) {
      this.fail(key, `${label} must be a valid date`);
      return null;
    }
    return v;
  }
  /** Returns the decimal as a canonical string (never a float). */
  decimal(key: string, label: string, opts: { required?: boolean; min?: number; max?: number } = {}): string | null {
    const v = this.raw(key);
    if (v === "") {
      if (opts.required) this.fail(key, `${label} is required`);
      return null;
    }
    const d = parseDecimalCell(v);
    if (d === null) {
      this.fail(key, `${label} must be a number`);
      return null;
    }
    const n = Number(d);
    if (opts.min !== undefined && n < opts.min) this.fail(key, `${label} must be at least ${opts.min}`);
    if (opts.max !== undefined && n > opts.max) this.fail(key, `${label} must be at most ${opts.max}`);
    return d;
  }
  int(key: string, label: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | null {
    const v = this.raw(key);
    if (v === "") {
      if (opts.required) this.fail(key, `${label} is required`);
      return null;
    }
    if (!/^-?\d+$/.test(v)) {
      this.fail(key, `${label} must be a whole number`);
      return null;
    }
    const n = Number(v);
    if (opts.min !== undefined && n < opts.min) this.fail(key, `${label} must be at least ${opts.min}`);
    if (opts.max !== undefined && n > opts.max) this.fail(key, `${label} must be at most ${opts.max}`);
    return n;
  }
  enumValue<T extends string>(key: string, label: string, allowed: readonly T[], required = true): T | null {
    const v = this.raw(key);
    if (v === "") {
      if (required) this.fail(key, `${label} is required`);
      return null;
    }
    if (!allowed.includes(v as T)) {
      this.fail(key, `${label} is not a valid choice`);
      return null;
    }
    return v as T;
  }
  uuid(key: string, label: string, required = true): string | null {
    const v = this.raw(key);
    if (v === "") {
      if (required) this.fail(key, `${label} is required`);
      return null;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      this.fail(key, `${label} is not valid`);
      return null;
    }
    return v.toLowerCase();
  }
  email(key: string, label = "Email"): string {
    const v = this.text(key, label, { required: true, max: 254 });
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) this.fail(key, `${label} is not valid`);
    return v;
  }
  password(key: string, label = "Password"): string {
    const v = (this.data as { get?: (k: string) => unknown }).get?.(key);
    const s = typeof v === "string" ? v : "";
    if (s.length < 10) this.fail(key, `${label} must be at least 10 characters`);
    if (s.length > 200) this.fail(key, `${label} is too long`);
    return s;
  }
  bool(key: string): boolean {
    const v = this.raw(key).toLowerCase();
    return v === "on" || v === "true" || v === "1" || v === "yes";
  }
  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
}

/** Only same-site relative paths are allowed as post-login redirects (no open redirects). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}

/** YYYY-MM-DD for "now" in an IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Safe file name for uploads: no path separators, bounded length. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").trim().slice(0, 120);
  return cleaned === "" || cleaned === "." ? "file" : cleaned;
}

export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
