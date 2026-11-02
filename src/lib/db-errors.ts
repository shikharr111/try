/**
 * Turns database/PostgREST errors into messages that are safe and useful to show users.
 * SQL text, table/constraint names and row values are never echoed. Messages raised deliberately by
 * our own functions and triggers (SQLSTATE P0001) are written for users and pass through, except for
 * embedded raw Postgres errors that those functions re-raise (e.g. "Row 3: duplicate key ...").
 */
export function friendlyDbError(error: { message?: string; code?: string } | null | undefined, fallback = "The request could not be completed."): string {
  if (!error) return fallback;
  const m = error.message ?? "";
  if (error.code === "42501" || /row-level security|permission denied/i.test(m)) return "You do not have permission to do that.";
  if (error.code === "23505" || /duplicate key/i.test(m)) return rowPrefix(m) + "That already exists, or conflicts with an existing record.";
  if (error.code === "23503" || /foreign key/i.test(m)) return rowPrefix(m) + "A referenced record does not exist or you cannot use it.";
  if (error.code === "23514" || /check constraint/i.test(m)) return rowPrefix(m) + "A value is outside the allowed range.";
  if (error.code === "23502" || /null value in column/i.test(m)) return rowPrefix(m) + "A required value is missing.";
  if (["22P02", "22007", "22008", "22003"].includes(error.code ?? "") || /invalid input syntax|out of range/i.test(m)) return rowPrefix(m) + "A value has an invalid format.";
  if (error.code === "P0001" && m && m.length < 300) return m;
  return fallback;
}

function rowPrefix(m: string): string {
  const r = /^Row (\d+):/.exec(m);
  return r ? `Row ${r[1]}: ` : "";
}
