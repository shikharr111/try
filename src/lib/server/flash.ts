import "server-only";
import { redirect } from "next/navigation";

/** Redirect with a one-line notice shown by <Flash/>. Messages are short, user-safe strings only. */
export function redirectWith(path: string, kind: "ok" | "err", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

export { friendlyDbError } from "../db-errors";
