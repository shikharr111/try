import { NextResponse } from "next/server";
import { IMPORT_COLUMNS } from "@/lib/import/definitions";
import { missingRequiredColumns } from "@/lib/import/validate";
import { getProjectContext } from "@/lib/server/session";
import { loadProjectBundle } from "@/lib/server/project-data";
import { isImportKind, parseMapping, parseUpload, validateAgainstProject } from "@/lib/server/import-service";
import { SheetError } from "@/lib/server/xlsx";
import { friendlyDbError } from "@/lib/db-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart: kind, file, optional mapping (JSON {columnKey: headerIndex|null}), mode = "preview" | "commit".
 * Commit re-parses the file and re-validates against the database; the browser's preview is never trusted.
 * All-or-nothing: any error blocks the commit; the database RPCs run in a single transaction and never overwrite.
 * UNVERIFIED against a live Supabase project.
 */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { supabase, user, project, access } = await getProjectContext(projectId);
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const kind = String(form.get("kind") ?? "");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const file = form.get("file");
  if (!isImportKind(kind)) return NextResponse.json({ error: "Unknown import type." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const structural = kind === "activities" || kind === "dependencies";
  if (structural ? !access.manage : !access.report) return NextResponse.json({ error: "You do not have permission to import this data." }, { status: 403 });

  let sheet;
  try { sheet = await parseUpload(file); } catch (e) { return NextResponse.json({ error: e instanceof SheetError ? e.message : "The file could not be read." }, { status: 400 }); }
  const mapping = parseMapping(typeof form.get("mapping") === "string" ? (form.get("mapping") as string) : null, kind, sheet.headers);
  const bundle = await loadProjectBundle(supabase, project, null);
  const { result, draftId } = await validateAgainstProject(supabase, project, bundle, kind, sheet, mapping);

  if (mode === "preview") {
    return NextResponse.json({
      headers: sheet.headers, mapping, missing: missingRequiredColumns(kind, mapping),
      columns: IMPORT_COLUMNS[kind].map((c) => ({ key: c.key, label: c.label, required: c.required, help: c.help ?? null })),
      totalRows: result.totalRows, validCount: result.validRows.length, errorCount: result.errorCount, warningCount: result.warningCount,
      canCommit: result.canCommit, issues: result.issues.slice(0, 300), issuesTruncated: result.issues.length > 300,
      sample: result.validRows.slice(0, 8),
      needsDraft: structural && !draftId,
    });
  }

  // ---- commit ----
  if (!result.canCommit) return NextResponse.json({ error: "The file still has errors. Nothing was imported.", errorCount: result.errorCount }, { status: 422 });
  let revision = draftId;
  if (kind === "dependencies" && !revision) return NextResponse.json({ error: "Start a draft baseline revision first; dependencies are imported into the draft." }, { status: 422 });
  if (kind === "activities" && !revision) {
    const { data: created, error } = await supabase.rpc("create_baseline_draft", { p_project: project.id, p_reason: `Import of ${file.name}`.slice(0, 500) });
    if (error || !created) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
    revision = created as string;
  }

  const rows = result.validRows;
  const { data, error } =
    kind === "activities" ? await supabase.rpc("import_activities", { p_project: project.id, p_revision: revision, p_rows: rows })
    : kind === "dependencies" ? await supabase.rpc("import_dependencies", { p_project: project.id, p_revision: revision, p_rows: rows })
    : kind === "daily_reports" ? await supabase.rpc("import_daily_reports", { p_project: project.id, p_rows: rows, p_submit: false })
    : await supabase.rpc("import_resource_records", { p_project: project.id, p_kind: kind, p_rows: rows });

  const status = error ? "rejected" : "committed";
  const summary = error ? { error: friendlyDbError(error) } : (data as Record<string, unknown> | null) ?? {};
  await supabase.from("import_jobs").insert({ project_id: project.id, kind, file_name: file.name.slice(0, 200), row_count: rows.length, status, summary, created_by: user.id });
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  return NextResponse.json({ ok: true, rows: rows.length, summary, message: structural ? "Imported into the draft baseline revision. Review it on the Plan page, then approve it." : "Imported as draft reports. Review and submit them on the Reports page." });
}
