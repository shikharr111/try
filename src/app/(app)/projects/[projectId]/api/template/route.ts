import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv/csv";
import { templateRows } from "@/lib/import/validate";
import { getProjectContext } from "@/lib/server/session";
import { isImportKind } from "@/lib/server/import-service";
import { writeXlsx } from "@/lib/server/xlsx";

export const runtime = "nodejs";

/** Header + one example row per import kind, as CSV or xlsx. Requires read access to the project. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await getProjectContext(projectId);
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "";
  if (!isImportKind(kind)) return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  const rows = templateRows(kind);
  if (u.searchParams.get("format") === "xlsx") {
    const buf = await writeXlsx([{ name: kind, rows }]);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sitepulse-${kind}-template.xlsx"`, "Cache-Control": "no-store" } });
  }
  return new NextResponse(toCsv(rows, { bom: true }), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sitepulse-${kind}-template.csv"`, "Cache-Control": "no-store" } });
}
