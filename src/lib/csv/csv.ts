/**
 * Dependency-free CSV parser/serializer (RFC 4180 + common real-world quirks).
 *  - strips a UTF-8 BOM, accepts CRLF/LF/CR, quoted fields with "" escapes and embedded newlines
 *  - auto-detects comma / semicolon / tab delimiter from the header line
 *  - NEVER silently drops anything: an unterminated quote throws, ragged rows are reported
 *  - serializer neutralises spreadsheet formula injection (cells starting with = + - @ tab CR)
 */

export class CsvError extends Error {
  constructor(message: string, public line?: number) {
    super(line ? `${message} (line ${line})` : message);
    this.name = "CsvError";
  }
}

export interface ParsedCsv {
  delimiter: string;
  headers: string[];
  /** Data rows (header excluded). Each entry carries its 1-based source line for error reporting. */
  rows: { line: number; cells: string[] }[];
  /** Data rows whose cell count differs from the header; they are still returned in `rows`. */
  raggedLines: number[];
}

function detectDelimiter(firstLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, opts: { maxRows?: number } = {}): ParsedCsv {
  const maxRows = opts.maxRows ?? 50_000;
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.trim() === "") throw new CsvError("File is empty");

  const firstLineEnd = text.search(/\r\n|\n|\r/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd));

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteOpenLine = 0;
  let line = 1;
  let recordLine = 1;
  let fieldWasQuoted = false;

  const endField = () => {
    cells.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    endField();
    // skip entirely blank lines (a single empty unquoted cell), but keep rows like ",,"
    if (!(cells.length === 1 && cells[0].trim() === "")) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "" && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      quoteOpenLine = line;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
      if (records.length > maxRows + 1) throw new CsvError(`Too many rows (limit ${maxRows})`);
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new CsvError("Unterminated quoted field", quoteOpenLine);
  if (field !== "" || cells.length > 0 || fieldWasQuoted) endRecord();

  if (records.length === 0) throw new CsvError("File has no header row");
  const headers = records[0].cells.map((h) => h.trim());
  if (headers.every((h) => h === "")) throw new CsvError("Header row is empty", records[0].line);
  const seen = new Set<string>();
  for (const h of headers) {
    const k = h.toLowerCase();
    if (k !== "" && seen.has(k)) throw new CsvError(`Duplicate column header "${h}"`, records[0].line);
    seen.add(k);
  }
  const rows = records.slice(1);
  const raggedLines = rows.filter((r) => r.cells.length !== headers.length).map((r) => r.line);
  return { delimiter, headers, rows, raggedLines };
}

export type CsvCell = string | number | boolean | null | undefined;

/** Neutralise formula injection for text cells. Numbers are written as numbers and left alone. */
export function safeCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function escapeField(s: string, delimiter: string): string {
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly CsvCell[])[], opts: { delimiter?: string; bom?: boolean } = {}): string {
  const d = opts.delimiter ?? ",";
  const body = rows.map((r) => r.map((c) => escapeField(safeCell(c), d)).join(d)).join("\r\n");
  return (opts.bom ? "﻿" : "") + body + "\r\n";
}
