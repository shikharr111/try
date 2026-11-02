import "server-only";
import ExcelJS from "exceljs";
import { safeCell, type CsvCell } from "../csv/csv";

/**
 * Excel (.xlsx) reading and writing with exceljs. UNVERIFIED: exceljs could not be installed in the build
 * sandbox, so this file has only been reviewed, not executed. Legacy .xls is not supported (convert to .xlsx or CSV).
 * Limits protect the server: 5 MB file, 20,000 data rows, 60 columns, first worksheet only.
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;
const MAX_COLS = 60;

export class SheetError extends Error {}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // exceljs returns UTC dates for date-only cells: use UTC parts so no timezone shift can move the day
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("error" in v) return "";
  }
  return String(v);
}

export async function readXlsx(buf: ArrayBuffer): Promise<{ headers: string[]; rows: { line: number; cells: string[] }[] }> {
  if (buf.byteLength > MAX_IMPORT_BYTES) throw new SheetError("File is larger than 5 MB.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new SheetError("The file could not be read as an .xlsx workbook.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new SheetError("The workbook has no worksheets.");
  const width = Math.min(ws.columnCount, MAX_COLS);
  if (ws.rowCount - 1 > MAX_IMPORT_ROWS) throw new SheetError(`More than ${MAX_IMPORT_ROWS} data rows. Split the file.`);
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).trim());
    out[n - 1] = cells;
  });
  const headerIdx = out.findIndex((r) => r && r.some((c) => c !== ""));
  if (headerIdx < 0) throw new SheetError("The first worksheet is empty.");
  const headers = out[headerIdx];
  const rows: { line: number; cells: string[] }[] = [];
  for (let i = headerIdx + 1; i < out.length; i++) {
    const r = out[i];
    if (!r || r.every((c) => c === "")) continue; // blank spacer rows are skipped
    rows.push({ line: i + 1, cells: r });
  }
  return { headers, rows };
}

export async function writeXlsx(sheets: { name: string; rows: readonly (readonly CsvCell[])[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SitePulse";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    s.rows.forEach((r, i) => {
      const row = ws.addRow(r.map((c) => (typeof c === "string" ? safeCell(c) : c ?? null)));
      if (i === 0) row.font = { bold: true };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.columns.forEach((col) => {
      let w = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => { w = Math.max(w, Math.min(48, String(cell.value ?? "").length + 2)); });
      col.width = w;
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
