import "server-only";
import { loadProjectBundle, type ProjectBundle } from "./project-data";
import type { ProjectRow, Supabase } from "./session";
import { num } from "../analytics/analytics";

export interface ProjectSummary {
  project: ProjectRow;
  bundle: ProjectBundle;
  health: string;
  plannedPct: number | null;
  actualPct: number | null;
  variancePp: number | null;
  forecastFinish: string | null;
  forecastStatus: string;
  delayDays: number | null;
  behindCritical: { code: string; name: string; variancePp: number }[];
  dataGaps: { code: string; flag: string }[];
}

const MAX_PROJECTS = 30;

export async function summarizeProjects(supabase: Supabase, projects: ProjectRow[], cutoff: string | null): Promise<{ rows: ProjectSummary[]; truncated: boolean }> {
  const list = projects.slice(0, MAX_PROJECTS);
  const rows = await Promise.all(
    list.map(async (project): Promise<ProjectSummary> => {
      const bundle = await loadProjectBundle(supabase, project, cutoff);
      const m = bundle.metrics;
      const behindCritical: ProjectSummary["behindCritical"] = [];
      const dataGaps: ProjectSummary["dataGaps"] = [];
      for (const a of bundle.input.activities) {
        const code = bundle.codeById.get(a.id) ?? a.id;
        const p = m.progress[a.id];
        const c = m.cpm.activities[a.id];
        if (c?.critical && p.progressVariancePp?.isNegative() && p.actualPct !== null && p.actualPct.lt(100)) {
          behindCritical.push({ code, name: a.name, variancePp: num(p.progressVariancePp) ?? 0 });
        }
        for (const f of p.flags) if (f === "NO_REPORTS" || f === "STALE_REPORTS") dataGaps.push({ code, flag: f });
      }
      behindCritical.sort((a, b) => a.variancePp - b.variancePp);
      return {
        project,
        bundle,
        health: m.health.status,
        plannedPct: num(m.plannedPct),
        actualPct: num(m.actualPct),
        variancePp: num(m.progressVariancePp),
        forecastFinish: m.forecast.forecastFinish,
        forecastStatus: m.forecast.status,
        delayDays: m.forecast.estimatedDelayDays,
        behindCritical,
        dataGaps,
      };
    }),
  );
  return { rows, truncated: projects.length > MAX_PROJECTS };
}

export interface ResourceSummary {
  project: ProjectRow;
  workforceVariancePct: string | null;
  comparedDays: number;
  unreportedDays: number;
  utilizationPct: string | null;
  downtimePct: string | null;
}

/** Workforce/machine summaries for the first `limit` projects (one query pair each; bounded to keep the page fast). */
export async function summarizeResources(supabase: Supabase, rows: ProjectSummary[], limit = 10): Promise<ResourceSummary[]> {
  const { loadResourceRows } = await import("./resources-data");
  const { buildResources } = await import("../ai/resources");
  return Promise.all(
    rows.slice(0, limit).map(async (r): Promise<ResourceSummary> => {
      const data = await loadResourceRows(supabase, r.project.id, r.bundle.cutoff);
      const res = buildResources(data.workforce, data.equipment, r.bundle.cutoff);
      return {
        project: r.project, workforceVariancePct: res.workforce.variancePct, comparedDays: res.workforce.comparedDays,
        unreportedDays: res.workforce.unreportedDays, utilizationPct: res.machines.utilizationPct, downtimePct: res.machines.downtimePct,
      };
    }),
  );
}
