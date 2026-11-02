import { layoutGantt, type GanttDep, type GanttInput } from "@/lib/gantt/layout";

/**
 * Server-rendered SVG Gantt. Bars = approved baseline dates; dark fill = actual progress; hatched extension = forecast
 * slip beyond baseline finish; critical activities carry a thick outline AND a "CP" text marker (not colour alone).
 * Bars whose forecast is "insufficient_data" are drawn with a dashed outline: no date is invented for them.
 * UNVERIFIED: geometry is unit-tested; the rendering was not viewed in a browser.
 */
export function Gantt({ items, deps, today }: { items: GanttInput[]; deps: GanttDep[]; today: string }) {
  const L = layoutGantt(items, deps, { today });
  if (items.length === 0) return <p className="text-sm text-ink-mute">No activities in the baseline.</p>;
  const LABEL_W = 220;
  return (
    <div className="flex overflow-x-auto rounded border border-steel-200 bg-white">
      <div className="sticky left-0 z-10 shrink-0 border-r border-steel-200 bg-white" style={{ width: LABEL_W }}>
        <div style={{ height: 28 }} className="border-b border-steel-200 px-2 py-1.5 text-xs font-semibold uppercase text-ink-mute">Activity</div>
        {L.bars.map((b) => (
          <div key={b.id} style={{ height: 30 }} className="flex items-center gap-1 truncate px-2 text-xs" title={b.label}>
            {b.critical && <span className="rounded bg-bad-soft px-1 font-semibold text-bad">CP</span>}
            <span className="truncate">{b.label}</span>
          </div>
        ))}
      </div>
      <svg width={L.width} height={L.height} role="img" aria-label="Gantt chart of the approved baseline with actual progress, forecast slip and critical path" className="shrink-0">
        <defs>
          <pattern id="slip" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="6" fill="#b42318" />
          </pattern>
        </defs>
        {L.ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={0} y2={L.height} stroke="#e2e8f0" />
            <text x={t.x + 3} y={18} fontSize={10} fill="#64748b" fontWeight={t.major ? 700 : 400}>{t.label}</text>
          </g>
        ))}
        {L.deps.map((d) => (
          <path key={`${d.from}-${d.to}`} d={d.path} fill="none" stroke="#94a3b8" strokeWidth={1} />
        ))}
        {L.bars.map((b) => (
          <g key={b.id}>
            <title>{`${b.label}: ${b.start} → ${b.finish}${b.forecastFinish ? `, forecast ${b.forecastFinish}` : b.status === "insufficient_data" ? ", forecast not available (insufficient data)" : ""}`}</title>
            <rect x={b.x} y={b.y} width={b.width} height={16} rx={2} fill="#cbd5e1"
              stroke={b.critical ? "#b42318" : "#94a3b8"} strokeWidth={b.critical ? 2 : 1} strokeDasharray={b.status === "insufficient_data" ? "3 2" : undefined} />
            {b.progressWidth > 0 && <rect x={b.x} y={b.y} width={b.progressWidth} height={16} rx={2} fill="#b45309" />}
            {b.slipWidth !== null && <rect x={b.x + b.width} y={b.y} width={b.slipWidth} height={16} fill="url(#slip)" />}
          </g>
        ))}
        {L.todayX !== null && (
          <g>
            <line x1={L.todayX} x2={L.todayX} y1={0} y2={L.height} stroke="#b42318" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={L.todayX + 3} y={L.height - 4} fontSize={10} fill="#b42318">Today</text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function GanttLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
      <li><span className="inline-block h-2.5 w-4 rounded-sm bg-steel-300 align-middle" /> Baseline duration</li>
      <li><span className="inline-block h-2.5 w-4 rounded-sm bg-accent align-middle" /> Actual progress</li>
      <li><span className="inline-block h-2.5 w-4 rounded-sm align-middle" style={{ background: "repeating-linear-gradient(45deg,#b42318 0 3px,#fff 3px 6px)" }} /> Forecast slip</li>
      <li><strong className="text-bad">CP</strong> / red outline: critical path</li>
      <li>Dashed outline: no forecast (insufficient data)</li>
    </ul>
  );
}
