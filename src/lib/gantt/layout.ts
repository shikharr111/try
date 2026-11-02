import { compareDates, diffDays, type ISODate } from "../calc/dates";

/**
 * Pure geometry for the Gantt chart (rendered as SVG by components/gantt.tsx). Keeping layout separate
 * makes it testable. Bars use the APPROVED BASELINE dates; critical flags come from the CPM engine and
 * progress from the progress engine: nothing here estimates or fakes schedule data.
 */
export interface GanttInput {
  id: string;
  label: string;
  start: ISODate;
  finish: ISODate;
  /** 0..100 actual progress (capped) or null when undefined */
  actualPct: number | null;
  plannedPct: number | null;
  critical: boolean;
  forecastFinish: ISODate | null;
  status: "completed" | "forecast" | "insufficient_data";
}
export interface GanttDep {
  from: string;
  to: string;
}
export interface GanttBar extends GanttInput {
  x: number;
  width: number;
  y: number;
  progressWidth: number;
  /** Extra width from the baseline finish to the forecast finish when forecast is later (null otherwise) */
  slipWidth: number | null;
}
export interface GanttLayout {
  width: number;
  height: number;
  bars: GanttBar[];
  deps: { path: string; from: string; to: string }[];
  ticks: { x: number; label: string; major: boolean }[];
  todayX: number | null;
  rangeStart: ISODate;
  rangeEnd: ISODate;
}

export interface GanttOptions {
  today?: ISODate;
  rowHeight?: number;
  barHeight?: number;
  pxPerDay?: number;
  leftPad?: number;
  headerHeight?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function layoutGantt(items: readonly GanttInput[], deps: readonly GanttDep[], o: GanttOptions = {}): GanttLayout {
  const rowH = o.rowHeight ?? 30;
  const barH = o.barHeight ?? 16;
  const px = o.pxPerDay ?? 6;
  const left = o.leftPad ?? 8;
  const head = o.headerHeight ?? 28;

  if (items.length === 0) {
    return { width: 0, height: head, bars: [], deps: [], ticks: [], todayX: null, rangeStart: "1970-01-01", rangeEnd: "1970-01-01" };
  }
  let start = items[0].start;
  let end = items[0].finish;
  for (const it of items) {
    if (compareDates(it.start, start) < 0) start = it.start;
    const f = it.forecastFinish && compareDates(it.forecastFinish, it.finish) > 0 ? it.forecastFinish : it.finish;
    if (compareDates(f, end) > 0) end = f;
  }
  if (o.today && compareDates(o.today, end) > 0) end = o.today;
  const xOf = (d: ISODate) => left + diffDays(start, d) * px;

  const bars: GanttBar[] = items.map((it, i) => {
    const x = xOf(it.start);
    const width = Math.max(px, (diffDays(it.start, it.finish) + 1) * px);
    const slip =
      it.forecastFinish && compareDates(it.forecastFinish, it.finish) > 0 ? diffDays(it.finish, it.forecastFinish) * px : null;
    return {
      ...it,
      x,
      width,
      y: head + i * rowH + (rowH - barH) / 2,
      progressWidth: it.actualPct === null ? 0 : (Math.min(100, Math.max(0, it.actualPct)) / 100) * width,
      slipWidth: slip,
    };
  });
  const byId = new Map(bars.map((b) => [b.id, b]));

  const depPaths = deps.flatMap((d) => {
    const a = byId.get(d.from);
    const b = byId.get(d.to);
    if (!a || !b) return [];
    const x1 = a.x + a.width;
    const y1 = a.y + barH / 2;
    const x2 = b.x;
    const y2 = b.y + barH / 2;
    // short elbow just after the predecessor's finish; never runs past the successor's start by more than a hook
    const mid = x1 + (x2 - x1 > 12 ? 6 : 3);
    return [{ from: d.from, to: d.to, path: `M${x1},${y1} H${mid} V${y2} H${x2}` }];
  });

  // ticks: first of each month (major on January)
  const ticks: GanttLayout["ticks"] = [];
  const [sy, sm] = start.split("-").map(Number);
  let y = sy;
  let m = sm;
  for (let guard = 0; guard < 240; guard++) {
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    if (compareDates(first, end) > 0) break;
    if (compareDates(first, start) >= 0) ticks.push({ x: xOf(first), label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, major: m === 1 });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  const todayX = o.today && compareDates(o.today, start) >= 0 && compareDates(o.today, end) <= 0 ? xOf(o.today) : null;
  return {
    width: xOf(end) + px * 2 + left,
    height: head + items.length * rowH + 6,
    bars,
    deps: depPaths,
    ticks,
    todayX,
    rangeStart: start,
    rangeEnd: end,
  };
}
