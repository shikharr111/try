import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyDbError } from "../db-errors";

test("db errors: constraint names, SQL and values are never echoed", () => {
  const dup = friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "activities_project_id_code_key"' });
  assert.equal(dup.includes("activities_project_id_code_key"), false);
  assert.match(dup, /already exists/);
  assert.match(friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "projects"' }), /permission/);
  assert.equal(friendlyDbError({ code: "23514", message: 'violates check constraint "x_check"' }).includes("x_check"), false);
});

test("db errors: our own raised messages pass through; re-raised raw errors are cleaned but keep the row number", () => {
  assert.equal(friendlyDbError({ code: "P0001", message: "Approved reports are locked" }), "Approved reports are locked");
  const r = friendlyDbError({ code: "P0001", message: 'Row 3: duplicate key value violates unique constraint "baseline_activities_revision_id_activity_id_key"' });
  assert.match(r, /^Row 3: That already exists/);
  assert.equal(r.includes("baseline_activities"), false);
  assert.match(friendlyDbError({ code: "P0001", message: "Row 2: new row violates check constraint \"baseline_activities_total_qty_check\"" }), /^Row 2: A value is outside/);
});

test("db errors: unknown and very long errors fall back to a generic message", () => {
  assert.equal(friendlyDbError({ code: "XX000", message: "internal: secret detail" }), "The request could not be completed.");
  assert.equal(friendlyDbError({ code: "P0001", message: "x".repeat(400) }, "fallback"), "fallback");
  assert.equal(friendlyDbError(null, "fb"), "fb");
});
