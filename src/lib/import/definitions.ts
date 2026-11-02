export type ImportKind = "activities" | "dependencies" | "daily_reports" | "workforce" | "equipment";

export type ColumnType = "text" | "date" | "decimal" | "int" | "enum";

export interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
  type: ColumnType;
  /** Extra header spellings recognised during automatic column mapping (matched after normalisation). */
  aliases: string[];
  enumValues?: readonly string[];
  /** For decimal/int */
  min?: number;
  maxLength?: number;
  example: string;
  help?: string;
}

const text = (key: string, label: string, required: boolean, example: string, aliases: string[] = [], maxLength = 200): ColumnDef =>
  ({ key, label, required, type: "text", aliases, example, maxLength });
const date = (key: string, label: string, required: boolean, example: string, aliases: string[] = []): ColumnDef =>
  ({ key, label, required, type: "date", aliases, example, help: "YYYY-MM-DD, or DD/MM/YYYY (day first)" });
const dec = (key: string, label: string, required: boolean, example: string, aliases: string[] = [], min = 0): ColumnDef =>
  ({ key, label, required, type: "decimal", aliases, example, min });

export const IMPORT_COLUMNS: Record<ImportKind, readonly ColumnDef[]> = {
  activities: [
    text("code", "Activity code", true, "EXC", ["activity code", "activity id", "id", "wbs code", "task code"], 40),
    text("name", "Activity name", true, "Site clearing & excavation", ["activity", "activity name", "task", "task name", "description"]),
    text("unit", "Unit", true, "m3", ["uom", "unit of measurement", "unit of measure"], 20),
    date("planned_start", "Planned start", true, "2026-11-02", ["start", "start date", "baseline start", "planned start date"]),
    date("planned_finish", "Planned finish", true, "2026-11-28", ["finish", "end", "end date", "finish date", "baseline finish", "planned end", "planned finish date"]),
    dec("total_qty", "Total quantity", true, "4800", ["quantity", "total quantity", "planned quantity", "qty", "approved quantity", "boq quantity"]),
    text("wbs_code", "WBS group", false, "1 Substructure", ["wbs", "wbs group", "work package", "phase"], 60),
    dec("planned_workers", "Planned workers", false, "18", ["workers", "planned workforce", "manpower", "planned manpower"]),
    dec("planned_machine_hours", "Planned machine-hours", false, "432", ["machine hours", "planned machine hours", "equipment hours"]),
    dec("weight", "Roll-up weight", false, "", ["weight", "weighting"]),
  ],
  dependencies: [
    text("predecessor_code", "Predecessor code", true, "EXC", ["predecessor", "pred", "from", "predecessor activity"], 40),
    text("successor_code", "Successor code", true, "FND", ["successor", "succ", "to", "successor activity"], 40),
    { key: "lag_working_days", label: "Lag (working days)", required: false, type: "int", aliases: ["lag", "lag days"], example: "0", min: -365 },
  ],
  daily_reports: [
    date("report_date", "Report date", true, "2026-10-22", ["date", "day"]),
    { key: "shift", label: "Shift", required: false, type: "enum", aliases: [], enumValues: ["day", "night"], example: "day" },
    text("activity_code", "Activity code", true, "FND", ["activity", "activity id", "code", "task code"], 40),
    dec("planned_workers", "Planned workers", false, "28", ["planned workforce", "planned manpower"]),
    dec("actual_workers", "Actual workers", false, "24", ["workers", "actual workforce", "manpower", "actual manpower"]),
    dec("planned_qty", "Planned quantity", false, "70", ["planned quantity", "target", "target qty"]),
    dec("actual_qty", "Actual quantity", true, "62.5", ["actual quantity", "completed", "completed quantity", "qty", "quantity done", "done"]),
    text("unit", "Unit", false, "m3", ["uom"], 20),
    text("observations", "Observations", false, "", ["remarks", "notes", "comments"], 2000),
  ],
  workforce: [
    date("report_date", "Report date", true, "2026-10-22", ["date"]),
    { key: "shift", label: "Shift", required: false, type: "enum", aliases: [], enumValues: ["day", "night"], example: "day" },
    text("activity_code", "Activity code", false, "FND", ["activity", "code"], 40),
    text("trade", "Trade", true, "Concrete & rebar crew", ["crew", "labour trade", "labor trade", "skill"], 80),
    dec("planned_workers", "Planned workers", false, "28", ["planned"]),
    dec("actual_workers", "Actual workers", true, "24", ["actual", "workers", "headcount"]),
    dec("hours_worked", "Hours worked", false, "8", ["hours", "shift hours"]),
  ],
  equipment: [
    date("report_date", "Report date", true, "2026-10-22", ["date"]),
    { key: "shift", label: "Shift", required: false, type: "enum", aliases: [], enumValues: ["day", "night"], example: "day" },
    text("activity_code", "Activity code", false, "FND", ["activity", "code"], 40),
    text("machine_type", "Machine type", true, "Concrete pump", ["machine", "equipment", "equipment type", "plant"], 80),
    { key: "machine_count", label: "Machine count", required: false, type: "int", aliases: ["count", "units", "no of machines"], example: "1", min: 0 },
    dec("planned_hours", "Planned hours", false, "8", ["planned machine hours", "planned"]),
    dec("operating_hours", "Operating hours", true, "7.5", ["operating", "run hours", "working hours", "hours"]),
    dec("downtime_hours", "Downtime hours", false, "0.5", ["downtime", "idle hours", "breakdown hours"]),
    text("downtime_reason", "Downtime reason", false, "Routine servicing", ["reason"], 300),
  ],
};

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  activities: "Activities & baseline schedule",
  dependencies: "Activity dependencies",
  daily_reports: "Daily actual reports",
  workforce: "Workforce records",
  equipment: "Equipment records",
};

/** Natural-key columns used for duplicate detection inside the file and against the database. */
export const NATURAL_KEYS: Record<ImportKind, readonly string[]> = {
  activities: ["code"],
  dependencies: ["predecessor_code", "successor_code"],
  daily_reports: ["report_date", "shift", "activity_code"],
  workforce: ["report_date", "shift", "activity_code", "trade"],
  equipment: ["report_date", "shift", "activity_code", "machine_type"],
};
