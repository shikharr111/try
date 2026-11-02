import { UnitMismatchError } from "./types";

const ALIASES: Record<string, string> = {
  "m3": "m3",
  "m³": "m3",
  "cum": "m3",
  "cu.m": "m3",
  "cu m": "m3",
  "m2": "m2",
  "m²": "m2",
  "sqm": "m2",
  "sq.m": "m2",
  "sq m": "m2",
  "m": "m",
  "rm": "m",
  "lm": "m",
  "kg": "kg",
  "t": "t",
  "ton": "t",
  "tonne": "t",
  "nos": "nos",
  "no": "nos",
  "no.": "nos",
  "ea": "nos",
  "each": "nos",
};

/** Normalises common construction unit spellings. Unknown units compare case-insensitively. */
export function normalizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

export function unitsMatch(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

/**
 * Units are never converted silently (m3 -> t would need density, etc.).
 * A reported unit that differs from the activity's approved unit is an error.
 */
export function assertUnitsMatch(activityId: string, expected: string, got: string | undefined): void {
  if (got === undefined || got === "") return; // unit defaults to the activity's unit
  if (!unitsMatch(expected, got)) throw new UnitMismatchError(activityId, expected, got);
}
