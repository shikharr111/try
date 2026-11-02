/**
 * Turns a spoken (or typed) daily site report into form fields.
 * Understands English, Hinglish (Latin letters) and a few Devanagari keywords.
 * Pure function: no browser APIs, so it is unit-tested.
 *
 *   "aaj 45 workers 6 machines progress 32 percent weather clear delay reason material shortage 2 hours lost remarks slab casting done"
 */

export const WEATHER_LIST = ["Clear", "Cloudy", "Light rain", "Heavy rain", "Heat wave", "Fog", "Strong wind", "Other"];
export const DELAY_LIST = [
  "Weather", "Material shortage", "Labour shortage", "Machine breakdown",
  "Design / drawing change", "Client / approval hold", "Land / site access", "Other",
];

export type VoiceParsed = {
  workers?: number;
  machines?: number;
  progress?: number;
  hoursLost?: number;
  weather?: string;
  reason?: string;
  remarks?: string;
};

const DEVA_DIGITS = "०१२३४५६७८९";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
  // Hinglish
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chheh: 6, cheh: 6, saat: 7,
  aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16,
  satrah: 17, atharah: 18, unnis: 19, bees: 20, pachis: 25, tees: 30, chalis: 40, pachas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90,
};
const HUNDRED = new Set(["hundred", "sau", "so"]);
const FILLER = new Set(["and", "aur"]);

/** replace spelled-out numbers ("fifty two", "ek sau bees", "one hundred and five") with digits */
export function numberWordsToDigits(input: string): string {
  const parts = input.split(/(\s+)/);
  const isSpace = (x: string) => /^\s+$/.test(x);
  const val = (x: string | undefined) => (x === undefined ? undefined : UNITS[x.toLowerCase()]);
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const first = val(parts[i]);
    if (first === undefined) { out.push(parts[i]); i++; continue; }
    // collect following word tokens, skipping spaces
    const next = (from: number) => { let k = from; while (k < parts.length && isSpace(parts[k])) k++; return k; };
    let total = first, end = i;
    let k = next(i + 1);
    // "<1-9> hundred"
    if (first >= 1 && first <= 9 && k < parts.length && HUNDRED.has(parts[k].toLowerCase())) {
      total = first * 100; end = k; k = next(k + 1);
      if (k < parts.length && FILLER.has(parts[k].toLowerCase())) {
        const k2 = next(k + 1);
        if (val(parts[k2]) !== undefined) k = k2;
      }
      const v = val(parts[k]);
      if (v !== undefined) {
        total += v; end = k; k = next(k + 1);
        const v2 = val(parts[k]);
        if (v >= 20 && v % 10 === 0 && v2 !== undefined && v2 >= 1 && v2 <= 9) { total += v2; end = k; }
      }
    } else if (first >= 20 && first % 10 === 0) {
      const v = val(parts[k]);
      if (v !== undefined && v >= 1 && v <= 9) { total += v; end = k; }
    }
    out.push(String(total));
    i = end + 1;
  }
  return out.join("");
}

function normalise(raw: string): string {
  let s = String(raw || "");
  s = s.replace(/[०-९]/g, d => String(DEVA_DIGITS.indexOf(d)));
  s = s.replace(/(\d),(\d{3})/g, "$1$2");                 // 1,200 -> 1200
  s = s.replace(/\bpoint\b/gi, ".").replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
  s = s.replace(/[%]/g, " percent ");
  s = s.replace(/[|।,;]+/g, " ");
  s = numberWordsToDigits(s);
  return s.replace(/\s+/g, " ").trim();
}

const NUM = "(\\d+(?:\\.\\d+)?)";
const WORKER_WORDS = "(?:workers?|labou?rs?|labou?rers?|manpower|mazdoor|mazdur|majdoor|majdur|log|aadmi|admi|karmchari|कर्मचारी|मजदूर|मज़दूर|मज़दूरों|लोग)";
const MACHINE_WORDS = "(?:machines?|machinery|equipments?|mashin|mashine|mashinen|मशीन|मशीनें|मशीनों)";
const PROGRESS_WORDS = "(?:progress|completion|complete|completed|pragati|प्रगति)";
const PERCENT_WORDS = "(?:percent|percentage|pc|pratishat|prathishat|प्रतिशत)";
const HOURS_WORDS = "(?:hours?|hrs?|ghante|ghanta|ghanta|घंटे|घंटा)";

function first(s: string, res: RegExp[]): number | undefined {
  for (const re of res) {
    const m = re.exec(s);
    if (m) { const n = Number(m[1]); if (!isNaN(n)) return n; }
  }
  return undefined;
}

function pickChoice(s: string, rules: [RegExp, string][]): string | undefined {
  for (const [re, v] of rules) if (re.test(s)) return v;
  return undefined;
}

export function parseVoiceEntry(raw: string): { fields: VoiceParsed; found: string[]; text: string } {
  const text = normalise(raw);
  const low = text.toLowerCase();
  const fields: VoiceParsed = {};

  // remarks: everything after the word "remarks / note / tippani"
  let body = low;
  const rm = /\b(?:remarks?|remark|notes?|tippani|comments?)\b\s*(?:is|are|:)?\s*(.+)$/i.exec(text);
  if (rm && rm[1].trim()) {
    fields.remarks = rm[1].trim().replace(/^./, c => c.toUpperCase());
    body = low.slice(0, low.length - rm[0].length);
  }

  // workers / machines: a number belongs to the keyword next to it, and is used only once
  // ("45 workers 6 machines" and "workers 45 machines 6" both work)
  const claimed = new Set<number>();
  const countFor = (words: string): number | undefined => {
    const kw = new RegExp(words, "ig");
    let m: RegExpExecArray | null;
    while ((m = kw.exec(body))) {
      const before = body.slice(0, m.index);
      const after = body.slice(m.index + m[0].length);
      const lm = new RegExp(`${NUM}\\s*$`).exec(before);
      const rm2 = new RegExp(`^\\s*(?:are|is|were|the|thi|thay|tha|:|=)?\\s*${NUM}`, "i").exec(after);
      const cand: [number, number][] = [];
      if (lm) cand.push([lm.index, Number(lm[1])]);
      if (rm2) cand.push([m.index + m[0].length + rm2.index + rm2[0].length - rm2[1].length, Number(rm2[1])]);
      for (const [pos, n] of cand) {
        if (claimed.has(pos)) continue;
        claimed.add(pos);
        return n;
      }
    }
    return undefined;
  };
  const w = countFor(WORKER_WORDS);
  if (w !== undefined && Number.isInteger(w)) fields.workers = w;
  const m = countFor(MACHINE_WORDS);
  if (m !== undefined && Number.isInteger(m)) fields.machines = m;

  const hrs = first(body, [
    new RegExp(`${NUM}\\s*${HOURS_WORDS}`, "i"),
    new RegExp(`(?:hours?\\s*lost|lost\\s*hours?)\\s*(?:are|is|:)?\\s*${NUM}`, "i"),
  ]);
  if (hrs !== undefined) fields.hoursLost = hrs;

  const p = first(body, [
    new RegExp(`${NUM}\\s*${PERCENT_WORDS}`, "i"),
    new RegExp(`${PROGRESS_WORDS}\\s*(?:is|was|are|at|hai|tha|:|=)?\\s*${NUM}`, "i"),
  ]);
  if (p !== undefined && p >= 0 && p <= 100) fields.progress = p;

  fields.weather = pickChoice(body, [
    [/heavy rain|bahut barish|tez barish|भारी बारिश|तेज़ बारिश|तेज बारिश/, "Heavy rain"],
    [/light rain|drizzle|halki barish|हल्की बारिश/, "Light rain"],
    [/heat ?wave|very hot|garmi|लू|गर्मी/, "Heat wave"],
    [/strong wind|high wind|windy|aandhi|तेज़ हवा|तेज हवा|आंधी/, "Strong wind"],
    [/\bfog\b|foggy|kohra|कोहरा/, "Fog"],
    [/cloudy|badal|बादल/, "Cloudy"],
    [/\brain\b|rainy|barish|बारिश/, "Light rain"],
    [/clear|sunny|saaf|sunshine|साफ़|साफ|धूप/, "Clear"],
  ]);
  if (fields.weather === undefined) delete fields.weather;

  fields.reason = pickChoice(body, [
    [/material (?:shortage|delay|nahi|issue)|maal (?:nahi|kam)|सामग्री/, "Material shortage"],
    [/labou?r shortage|worker shortage|manpower shortage|majdoor kam|मजदूर कम/, "Labour shortage"],
    [/machine (?:breakdown|break down|kharab|failure)|breakdown|मशीन खराब/, "Machine breakdown"],
    [/design|drawing/, "Design / drawing change"],
    [/client|approval|permission/, "Client / approval hold"],
    [/land|site access|access issue|raasta|रास्ता/, "Land / site access"],
    [/delay reason (?:is |was )?weather|delayed (?:due to|by|because of) (?:rain|weather)|rain delay|barish ki wajah/, "Weather"],
  ]);
  if (fields.reason === undefined) delete fields.reason;

  const found: string[] = [];
  if (fields.workers !== undefined) found.push("workers");
  if (fields.machines !== undefined) found.push("machines");
  if (fields.progress !== undefined) found.push("progress");
  if (fields.hoursLost !== undefined) found.push("hoursLost");
  if (fields.weather) found.push("weather");
  if (fields.reason) found.push("reason");
  if (fields.remarks) found.push("remarks");
  return { fields, found, text };
}
