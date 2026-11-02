"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Thin Recharts wrappers. They only draw numbers computed by the server-side engine; no calculation happens here.
 * Colours are paired with distinct line styles / labels so meaning never depends on colour alone.
 * UNVERIFIED: not rendered in a browser in the build sandbox.
 */
const C = { planned: "#475569", actual: "#b45309", bad: "#b42318", warn: "#b54708", ok: "#067647", grid: "#e2e8f0" };

export interface SPoint { date: string; plannedPct: number | null; actualPct: number | null }

export function SCurveChart({ data }: { data: SPoint[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-mute">No data in range.</p>;
  return (
    <div role="img" aria-label="Planned versus actual cumulative progress over time" style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => (v === null || v === undefined ? "no data" : `${v}%`)} />
          <Legend />
          <Line type="monotone" dataKey="plannedPct" name="Planned" stroke={C.planned} strokeDasharray="6 4" dot={false} strokeWidth={2} connectNulls={false} />
          <Line type="monotone" dataKey="actualPct" name="Actual" stroke={C.actual} dot={false} strokeWidth={2.5} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DeltaBars({ data }: { data: { period: string; planned: number | null; actual: number | null }[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-mute">No data in range.</p>;
  return (
    <div role="img" aria-label="Progress made per period, planned versus actual" style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis unit=" pp" tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => (v === null || v === undefined ? "no data" : `${v} pp`)} />
          <Legend />
          <Bar dataKey="planned" name="Planned" fill={C.planned} />
          <Bar dataKey="actual" name="Actual" fill={C.actual} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBars({ data }: { data: { label: string; days: number; confirmed: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-mute">No delay events in range.</p>;
  return (
    <div role="img" aria-label="Delay working days by reason" style={{ width: "100%", height: Math.max(200, data.length * 38 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals />
          <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="days" name="All (non-dismissed)" fill={C.warn} />
          <Bar dataKey="confirmed" name="Confirmed" fill={C.bad} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlannedActualBars({ data, unit, aKey = "actual", pKey = "planned" }: { data: Record<string, number | string | null>[]; unit: string; aKey?: string; pKey?: string }) {
  if (data.length === 0) return <p className="text-sm text-ink-mute">No data in range.</p>;
  return (
    <div role="img" aria-label={`Planned versus actual ${unit}`} style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis unit={` ${unit}`} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey={pKey} name="Planned" fill={C.planned} />
          <Bar dataKey={aKey} name="Actual" fill={C.actual} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Generic grouped bar chart (used for per-project progress and the portfolio delay trend). Values come from the server. */
export function GroupedBars({ data, xKey, series, unit, label, height = 280 }: {
  data: Record<string, string | number | null>[]; xKey: string; unit?: string; label: string; height?: number;
  series: { key: string; name: string; color?: "planned" | "actual" | "warn" | "bad" | "ok" }[];
}) {
  if (data.length === 0) return <p className="text-sm text-ink-mute">No data for this selection.</p>;
  return (
    <div role="img" aria-label={label} style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis unit={unit ? ` ${unit}` : undefined} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => (v === null || v === undefined ? "no data" : `${v}${unit ? ` ${unit}` : ""}`)} />
          <Legend />
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={C[s.color ?? "actual"]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
