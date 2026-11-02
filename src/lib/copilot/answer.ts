/**
 * InfraTrack Copilot answer engine. Pure function: question text + the project summary -> answer text.
 * It never invents data: every number comes from the summary, and when the question is not understood it says so
 * and lists what it can answer. Understands English, Hinglish and Hindi keywords, and activity / contractor names.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Fmt = { signedNum: (n: number) => string; fmtMoney: (n: number) => string; fmtDMY: (d: string) => string };

export type Intent = "delay" | "cost" | "forecast" | "safety" | "contractor" | "workforce" | "weather" | "progress" | "focus" | "help";

// Each keyword is matched as a word prefix, so "delayed", "delays" and "delay" all hit "delay".
const KEYWORDS: Record<Intent, string[]> = {
  delay: ["delay", "late", "behind", "slip", "overdue", "peeche", "pichh", "pichad", "deri", "der ", "लेट", "देरी", "पीछे", "पिछड़"],
  cost: ["cost", "budget", "spend", "spent", "money", "expens", "paisa", "paise", "kharch", "kharcha", "rupee", "cpi", "eac", "bac", "खर्च", "बजट", "लागत", "पैसा", "पैसे"],
  forecast: ["forecast", "finish", "complet", "deadline", "eta", "end date", "when will", "kab", "predict", "projected", "handover", "कब", "पूरा", "समाप्त", "अनुमान"],
  safety: ["safe", "incident", "injur", "accident", "hazard", "ltifr", "near miss", "suraksha", "hadsa", "haadsa", "chot", "सुरक्षा", "हादसा", "दुर्घटना", "चोट"],
  contractor: ["contractor", "vendor", "subcontract", "thekedar", "spi", "ठेकेदार"],
  workforce: ["worker", "labour", "labor", "manpower", "headcount", "machine", "equipment", "resource", "mazdoor", "majdoor", "kaamgar", "mashin", "श्रमिक", "मजदूर", "मज़दूर", "कामगार", "मशीन"],
  weather: ["weather", "rain", "barish", "baarish", "mausam", "hours lost", "मौसम", "बारिश"],
  progress: ["progress", "status", "overall", "summary", "health", "score", "how is", "how are", "kaisa", "kaisi", "pragati", "update", "प्रगति", "स्थिति", "हालत", "कैसा", "कैसी"],
  focus: ["focus", "priorit", "urgent", "alert", "important", "attention", "kya karu", "kya karun", "kahan dhyan", "सबसे ज़रूरी", "ज़रूरी", "जरूरी", "प्राथमिकता"],
  help: ["help", "what can you", "kya kar sakte", "kya puch", "hello", "hi ", "hey", "namaste", "namaskar", "नमस्ते", "मदद"],
};

const PRIORITY: Intent[] = ["delay", "cost", "forecast", "safety", "contractor", "workforce", "weather", "progress", "focus", "help"];

function norm(q: string): string {
  return " " + q.toLowerCase().replace(/[?!.,;:()"“”]/g, " ").replace(/\s+/g, " ").trim() + " ";
}

function hits(t: string, kw: string): boolean {
  const k = kw.toLowerCase();
  if (k.endsWith(" ")) return t.includes(" " + k) || t.includes(k);
  // word-prefix match
  let i = t.indexOf(k);
  while (i !== -1) {
    const before = t[i - 1];
    if (i === 0 || before === " " || before === "-") return true;
    i = t.indexOf(k, i + 1);
  }
  return false;
}

export function detectIntents(q: string): Intent[] {
  const t = norm(q);
  const score = new Map<Intent, number>();
  (Object.keys(KEYWORDS) as Intent[]).forEach((intent) => {
    let n = 0;
    for (const kw of KEYWORDS[intent]) if (hits(t, kw)) n += 2;
    if (n) score.set(intent, n);
  });
  // generic topics (overall status, focus, greetings) only when no specific topic matched
  const specific = [...score.keys()].some((k) => k !== "progress" && k !== "focus" && k !== "help");
  if (specific) ["progress", "focus", "help"].forEach((k) => score.delete(k as Intent));
  else if (score.size > 1) score.delete("help");
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  if (!ranked.length) return [];
  const top = ranked[0][1];
  // the best intent, plus a second one only if it scored nearly as high (e.g. "cost and delay")
  return ranked.filter((r, i) => i === 0 || (i === 1 && r[1] >= Math.max(2, top - 1))).map((r) => r[0]);
}

const STOP = new Set(["the", "and", "for", "work", "works", "of", "in", "at", "to", "a", "an", "is", "me", "my", "ka", "ki", "ke", "kya", "hai", "ye", "wo", "mein", "me"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** Finds the activity (or contractor) the question is about, by name. */
export function findNamed<T extends { name: string }>(q: string, list: T[]): T | null {
  const t = norm(q);
  const qw = new Set(words(q));
  let best: { item: T; score: number } | null = null;
  for (const item of list) {
    const name = item.name.toLowerCase();
    let score = 0;
    if (t.includes(" " + name + " ") || t.includes(name)) score = 100 + name.length;
    else {
      const nw = words(item.name);
      const common = nw.filter((w) => qw.has(w) || [...qw].some((x) => x.length >= 4 && (w.startsWith(x) || x.startsWith(w))));
      if (common.length >= 2 || (nw.length === 1 && common.length === 1) || (common.length === 1 && common[0].length >= 6)) score = common.reduce((s, w) => s + w.length, 0);
    }
    if (score && (!best || score > best.score)) best = { item, score };
  }
  return best ? best.item : null;
}

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : null);

function aboutActivity(r: any, f: Fmt): string {
  const bits = [`${r.name}: ${r.actualPct}% done against ${r.plannedPct}% planned (${r.status}).`];
  if (num(r.delayDays) && r.delayDays > 0) bits.push(`About ${r.delayDays} day(s) behind plan.`);
  if (r.forecastEnd && r.status !== "Completed") bits.push(`At the current pace it finishes around ${f.fmtDMY(r.forecastEnd)}${num(r.projectedDelay) ? ` (${r.projectedDelay > 0 ? `${r.projectedDelay} days late` : r.projectedDelay < 0 ? `${-r.projectedDelay} days early` : "on time"})` : ""}.`);
  if (r.lastLog) bits.push(`Last progress logged on ${f.fmtDMY(r.lastLog)}.`);
  else if (r.status !== "Not started") bits.push("No progress has been logged yet.");
  return bits.join(" ");
}

function answerIntent(intent: Intent, s: any, f: Fmt): string {
  switch (intent) {
    case "delay": {
      const parts: string[] = [];
      if (s.progress && s.progress.actual !== null) parts.push(`Progress is ${s.progress.actual}% against ${s.progress.planned}% planned (${f.signedNum(s.progress.variance)} pts, ${s.status}).`);
      if (num(s.delayDays) && s.delayDays > 0) parts.push(`That is about ${s.delayDays} days behind plan.`);
      const late = s.act ? s.act.rows.filter((r: any) => r.status === "Delayed") : [];
      if (late.length) parts.push(`Delayed activities: ${late.slice(0, 3).map((r: any) => `${r.name} (${r.delayDays}d)`).join(", ")}.`);
      const risk = s.act ? s.act.rows.filter((r: any) => r.status === "At Risk") : [];
      if (risk.length) parts.push(`At risk: ${risk.slice(0, 3).map((r: any) => r.name).join(", ")}.`);
      return parts.length ? parts.join(" ") : "No progress % or activity logs yet, so I can't tell if anything is delayed.";
    }
    case "cost": {
      const c = s.cost;
      if (!c || (c.BAC === null && !c.AC)) return "No budget or costs are entered yet.";
      return `Spent ${f.fmtMoney(c.AC)}${c.BAC !== null ? ` of ${f.fmtMoney(c.BAC)} (${c.usedPct}%)` : ""}.${c.CPI !== null ? ` CPI is ${c.CPI}${c.CPI < 1 ? " (over budget for the work done)" : " (within budget)"}${c.EAC !== null ? `, so the final cost is heading to about ${f.fmtMoney(c.EAC)}` : ""}.` : " CPI needs a budget, spend and a progress %."}`;
    }
    case "forecast": {
      if (!s.forecastEnd) return `Planned completion is ${s.plan ? f.fmtDMY(s.plan.endDate) : "not set"}. A forecast needs at least one daily report with progress above 0%.`;
      return `At the current pace the project finishes around ${f.fmtDMY(s.forecastEnd)} versus ${f.fmtDMY(s.plan.endDate)} planned (${s.projectedDelay > 0 ? `${s.projectedDelay} days late` : s.projectedDelay < 0 ? `${-s.projectedDelay} days early` : "on time"}).`;
    }
    case "safety": {
      const sf = s.safety;
      if (!sf || sf.total === 0) return "No safety incidents are logged for this project.";
      return `${sf.total} incident(s) logged, ${sf.open ? sf.open.length : 0} still open${sf.daysSince !== null && sf.daysSince !== undefined ? `, ${sf.daysSince} days since the last one` : ""}.${num(sf.lti) ? ` ${sf.lti} lost-time injur${sf.lti === 1 ? "y" : "ies"}.` : ""}`;
    }
    case "contractor": {
      const list = (s.contractors || []).filter((c: any) => c.spi !== null && c.spi !== undefined);
      if (!list.length) return "No contractor-tagged activities yet.";
      const w = [...list].sort((a: any, b: any) => a.spi - b.spi)[0];
      return `${w.name} has the lowest schedule performance (SPI ${w.spi}, ${w.delayed} delayed activit${w.delayed === 1 ? "y" : "ies"}).${list.length > 1 ? ` ${list.length} contractors are tracked.` : ""}`;
    }
    case "workforce": {
      const l = s.tr && s.tr.latest;
      if (!l) return "No daily reports are entered yet, so I have no workers or machines data.";
      const bits = [`On ${f.fmtDMY(l.date)}: ${l.workers} workers (planned ${l.plannedWorkers}) and ${l.machines} machines (planned ${l.plannedMachines}).`];
      const r = s.tr.resources;
      if (r && r.workerShort !== null && r.workerShort !== undefined && r.compDays) bits.push(`Over the reported days workers are ${r.workerShort > 0 ? `${Math.round(r.workerShort)}% short of plan` : "at or above plan"}.`);
      return bits.join(" ");
    }
    case "weather": {
      const l = s.tr && s.tr.latest;
      if (!l) return "No daily reports are entered yet, so I have no weather data.";
      const lost = (s.tr.rows || []).reduce((a: number, r: any) => a + (num(r.hoursLost) || 0), 0);
      return `Latest report (${f.fmtDMY(l.date)}): weather ${l.weather || "not recorded"}${l.reason ? `, delay reason: ${l.reason}` : ""}. Total working hours lost so far: ${lost}.`;
    }
    case "progress": {
      const parts: string[] = [];
      if (s.progress && s.progress.actual !== null) parts.push(`Overall progress is ${s.progress.actual}% against ${s.progress.planned}% planned (${f.signedNum(s.progress.variance)} pts, ${s.status}).`);
      if (s.health && s.health.score !== null && s.health.score !== undefined) parts.push(`Project health: ${s.health.level} (${s.health.score}/100).`);
      if (s.alerts && s.alerts.length) parts.push(`${s.alerts.length} alert(s) open.`);
      return parts.length ? parts.join(" ") : "There is not enough data yet for a progress summary.";
    }
    case "focus":
      return s.alerts && s.alerts.length ? `Top items: ${s.alerts.slice(0, 3).map((a: any) => a.title).join("; ")}.` : "Nothing urgent from the data entered so far.";
    default:
      return HELP;
  }
}

export const HELP = "I answer only from the plan and actuals entered in this project. Ask about: delays, cost / budget, forecast completion, safety, contractors, workers & machines, weather, overall progress, what to focus on — or name an activity (for example “How is Earthwork going?”).";

export function answerQuestion(q: string, s: any, project: any, f: Fmt): string {
  if (!project) return "There is no project yet.";
  const text = (q || "").trim();
  if (!text) return HELP;
  const intents = detectIntents(text);
  if (intents.length === 1 && intents[0] === "help") return HELP;
  if (!s || !s.hasAnyData) return "No data is entered for this project yet. Add the planned data first, then report actuals.";

  // A named activity or contractor beats the general topics.
  const act = s.act ? findNamed(text, s.act.rows) : null;
  if (act) return aboutActivity(act, f);
  const con = findNamed(text, s.contractors || []);
  if (con && !intents.includes("contractor")) {
    const c: any = con;
    return `${c.name}: ${c.activities} activit${c.activities === 1 ? "y" : "ies"}${c.spi !== null && c.spi !== undefined ? `, SPI ${c.spi}` : ""}${num(c.delayed) ? `, ${c.delayed} delayed` : ""}.`;
  }

  if (!intents.length) return `I'm not sure what you mean by “${text.slice(0, 80)}”. ${HELP}`;
  return intents.map((i) => answerIntent(i, s, f)).join("\n\n");
}
