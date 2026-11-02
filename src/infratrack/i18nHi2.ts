import { I18N_PAIRS } from "./i18nHi3";
/* More Hindi translations for the runtime translator in InfraTrack.tsx.
   I18N_EXACT2: whole-string matches. I18N_RX_FIRST: sentences with numbers; these run BEFORE the older, more generic
   rules so that "30 days" etc. are not half-translated first. Numbers may have decimals. */
let _tr: (x: string) => string = (x) => x;
/** InfraTrack.tsx hands over its translator so captured pieces (names, dates, "Over"...) are translated too */
export const setTrHi = (f: (x: string) => string) => { _tr = f; };
const N = "([−-]?\\d+(?:\\.\\d+)?)";
const PTS = "(?:pts|points)";

export const I18N_EXACT2: Record<string, string> = {
  "About InfraTrack": "InfraTrack के बारे में",
  "Connecting plans to reality": "योजनाओं को हकीकत से जोड़ना",
  "About the website": "वेबसाइट के बारे में",
  "A site-progress tracker for construction and infrastructure projects.": "निर्माण और इंफ्रास्ट्रक्चर प्रोजेक्ट्स के लिए साइट प्रगति ट्रैकर।",
  "Copy site link": "साइट का लिंक कॉपी करें",
  "Copied": "कॉपी हो गया",
  "Link copied": "लिंक कॉपी हो गया",
  "InfraTrack helps a project team compare what was planned with what actually happened on site, day by day, so delays are noticed early instead of at the end of the month.":
    "InfraTrack प्रोजेक्ट टीम को रोज़ यह तुलना करने में मदद करता है कि योजना क्या थी और साइट पर असल में क्या हुआ, ताकि देरी महीने के अंत में नहीं, बल्कि जल्दी पकड़ी जाए।",
  "Plan vs actual": "योजना बनाम वास्तविक",
  "Enter the project plan once, report the site every day, and see exactly where the work is ahead or behind.":
    "प्रोजेक्ट की योजना एक बार भरें, रोज़ साइट की रिपोर्ट दें, और देखें कि काम कहाँ आगे है और कहाँ पीछे।",
  "Daily reports, activity progress, cost, safety incidents and Excel/CSV paste in one place.":
    "दैनिक रिपोर्ट, गतिविधि प्रगति, लागत, सुरक्षा घटनाएँ और Excel/CSV पेस्ट, सब एक ही जगह।",
  "Delay and forecast": "देरी और पूर्वानुमान",
  "Delay detection from the difference between plan and actual, plus a predicted completion date.":
    "योजना और वास्तविक के अंतर से देरी की पहचान, साथ में अनुमानित समापन तिथि।",
  "Cost, safety, contractors": "लागत, सुरक्षा, ठेकेदार",
  "Budget vs actual, incident log, and contractor performance on the same data.":
    "बजट बनाम वास्तविक खर्च, घटना लॉग और ठेकेदार का प्रदर्शन, उसी डेटा पर।",
  "Reports and backup": "रिपोर्ट और बैकअप",
  "Daily progress reports, PDF/Excel project reports, audit trail, and cloud sync to your own account.":
    "दैनिक प्रगति रिपोर्ट, PDF/Excel प्रोजेक्ट रिपोर्ट, ऑडिट ट्रेल और आपके अपने खाते में क्लाउड सिंक।",
  "Developer": "डेवलपर",
  "The person who built this website.": "इस वेबसाइट को बनाने वाले।",
  "Shikhar Pratap Singh": "शिखर प्रताप सिंह",
  "Website developer": "वेबसाइट डेवलपर",
  "Last updated": "आख़िरी अपडेट",
  "Showing the saved report for this day. Saving again replaces it.": "इस दिन की सेव की हुई रिपोर्ट दिख रही है। दोबारा सेव करने पर वह बदल जाएगी।",
  "Delete this report": "यह रिपोर्ट हटाएँ",
  "Reopen": "फिर से खोलें",
  "Closed": "बंद",
  "Open": "खुला",
  "on time": "समय पर",
  "nos": "संख्या",
  "Cloudy": "बादल",
  "Clear": "साफ़",
  "Light rain": "हल्की बारिश",
  "Heavy rain": "भारी बारिश",
  "Heat wave": "लू",
  "Fog": "कोहरा",
  "Strong wind": "तेज़ हवा",
  "Minor": "मामूली",
  "Major": "गंभीर",
  "Critical": "अति गंभीर",
  "Material": "सामग्री",
  "Labour": "श्रम",
  "Machinery": "मशीनरी",
  "Other": "अन्य",
  'Example: "45 workers, 6 machines, progress 32 percent, weather clear, 2 hours lost, remarks slab casting done"':
    'उदाहरण: "45 मज़दूर, 6 मशीनें, प्रगति 32 प्रतिशत, मौसम साफ़, 2 घंटे खोए, टिप्पणी स्लैब कास्टिंग हो गई"',
  "Schedule: 100 − 5 × pts behind. Resources: 100 − average shortfall %. Cost: CPI × 100. Safety: 100 − incident points in 30 days. Reporting: 100 − 10 per missed day.":
    "शेड्यूल: 100 − 5 × पीछे के अंक। संसाधन: 100 − औसत कमी %। लागत: CPI × 100। सुरक्षा: 100 − पिछले 30 दिनों के घटना अंक। रिपोर्टिंग: 100 − छूटे हर दिन के 10 अंक।",
  "Headline numbers, planned vs actual progress curve, activity progress bars, status mix, open alerts and cost summary. Ready to send to the client.":
    "मुख्य आँकड़े, नियोजित बनाम वास्तविक प्रगति वक्र, गतिविधि प्रगति बार, स्थिति का मिश्रण, खुले अलर्ट और लागत सारांश। क्लाइंट को भेजने के लिए तैयार।",
  "No backup taken yet": "अभी तक कोई बैकअप नहीं लिया गया",
  "Voice entry": "आवाज़ से प्रविष्टि",
  "Tap and speak": "टैप करें और बोलें",
  "Stop listening": "सुनना बंद करें",
  "Only fill the form": "सिर्फ़ फ़ॉर्म भरें",
  "Clear text": "टेक्स्ट हटाएँ",
  "Listening…": "सुन रहा है…",
  "● Listening…": "● सुन रहा है…",
  "English / Hinglish": "English / हिंग्लिश",
};

const weatherWords = (s: string) => s
  .replace(/\bHeavy rain\b/g, "भारी बारिश").replace(/\bLight rain\b/g, "हल्की बारिश").replace(/\bCloudy\b/g, "बादल")
  .replace(/\bClear\b/g, "साफ़").replace(/\bHeat wave\b/g, "लू").replace(/\bFog\b/g, "कोहरा").replace(/\bStrong wind\b/g, "तेज़ हवा");

export const I18N_RX_FIRST: [RegExp, string | ((...a: any[]) => string)][] = [
  [new RegExp(`${N} working hours lost \\(from daily reports\\)`, "g"), "$1 कार्य घंटे खोए (दैनिक रिपोर्टों से)"],
  [/Latest \((.+?)\): (\d+) workers \/ (\d+) machines vs (\d+) \/ (\d+) planned/g, "ताज़ा ($1): $2 मज़दूर / $3 मशीनें बनाम $4 / $5 नियोजित"],
  [new RegExp(`Plan for (.+?): outside the planned date range\\.`, "g"), "$1 की योजना: नियोजित तारीख़ सीमा से बाहर।"],
  [new RegExp(`Plan for (.+?): not a planned working day\\. Work reported here counts as extra and is left out of the resource comparison\\.`, "g"),
    "$1 की योजना: यह नियोजित कार्य दिवस नहीं है। यहाँ दर्ज काम अतिरिक्त गिना जाता है और संसाधन तुलना में शामिल नहीं होता।"],
  [new RegExp(`Plan for (.+?): (\\d+) workers · (\\d+) machines · ${N}% cumulative progress`, "g"), "$1 की योजना: $2 मज़दूर · $3 मशीनें · $4% कुल प्रगति"],
  [new RegExp(`last reported ${N}% on (.+)$`, "g"), "आख़िरी रिपोर्ट $1% ($2)"],
  [/Weather: (.+)$/, (_m: string, w: string) => `मौसम: ${weatherWords(w)}`],
  [/\(workers \+ machines\)/g, "(मज़दूर + मशीनें)"],
  [/No backup taken yet/g, "अभी तक कोई बैकअप नहीं लिया गया"],
  [/ — (At Risk|Delayed|Ahead|On Track|Completed|Not started)\)/g, (_m: string, st: string) => ` — ${({ "At Risk": "जोखिम में", Delayed: "देरी", Ahead: "आगे", "On Track": "समय पर", Completed: "पूर्ण", "Not started": "शुरू नहीं" } as any)[st]})`],
  [/^Plan (\d+(?:\.\d+)?%?)$/, "योजना $1"],
  [/^Last synced (.+)$/, "आख़िरी सिंक $1"],
  [/\bfrom daily reports\b/g, "दैनिक रिपोर्टों से"],
  [new RegExp(`last week: ${N}% vs ${N}% planned`, "g"), "पिछला सप्ताह: $1% बनाम $2% नियोजित"],
  [/\bPrevious week:/g, "पिछला सप्ताह:"],
  [new RegExp(`Machines ${N} vs ${N} · ${N} h lost`, "g"), "मशीनें $1 बनाम $2 · $3 घंटे खोए"],
  [new RegExp(`Machines ${N} vs ${N}`, "g"), "मशीनें $1 बनाम $2"],
  [new RegExp(`Workers ${N} vs ${N}`, "g"), "मज़दूर $1 बनाम $2"],
  [new RegExp(`(₹[\\d.,]+(?: [LC]r?)?) of (₹[\\d.,]+(?: [LC]r?)?) · CPI`, "g"), "$1 / $2 · CPI"],
  [new RegExp(`At the average pace so far, completion lands around (.+?) vs planned (.+?) \\(([+−-]?\\d+) days?\\)\\.`, "g"),
    "अब तक की औसत गति से समापन लगभग $1 को होगा, जबकि नियोजित $2 है ($3 दिन)।"],
  [new RegExp(`Average ${N} workers/day vs ${N} planned across ${N} reported working days \\(${N}% (short|over)\\)\\.`, "g"),
    (_m: string, a: string, b: string, c: string, d: string, w: string) => `औसतन ${a} मज़दूर/दिन, नियोजित ${b} के मुकाबले, ${c} दर्ज कार्य दिवसों में (${d}% ${w === "short" ? "कम" : "ज़्यादा"})।`],
  [new RegExp(`Average ${N} machines/day vs ${N} planned across ${N} reported working days \\(${N}% (short|over)\\)\\.`, "g"),
    (_m: string, a: string, b: string, c: string, d: string, w: string) => `औसतन ${a} मशीनें/दिन, नियोजित ${b} के मुकाबले, ${c} दर्ज कार्य दिवसों में (${d}% ${w === "short" ? "कम" : "ज़्यादा"})।`],
  [/0 नियोजित कार्य दिवस बिना रिपोर्ट in the last 30 दिन/g, "पिछले 30 दिनों में 0 नियोजित कार्य दिवस बिना रिपोर्ट"],
  [new RegExp(`(\\d+) planned working days? without a report in the last 30 days`, "g"), "पिछले 30 दिनों में $1 नियोजित कार्य दिवस बिना रिपोर्ट"],
  [new RegExp(`Planned ${N} workers · ${N} machines per day`, "g"), "नियोजित $1 मज़दूर · $2 मशीनें प्रतिदिन"],
  [/नियोजित (\d+) workers · (\d+) machines per day/g, "नियोजित $1 मज़दूर · $2 मशीनें प्रतिदिन"],
  [/Latest: /g, "ताज़ा: "],
  [new RegExp(`${N}% workers`, "g"), "$1% मज़दूर"],
  [new RegExp(`Machines ${N}% · over (\\d+) reported working days`, "g"), "मशीनें $1% · $2 दर्ज कार्य दिवसों में"],
  [new RegExp(`(.+?): (\\d{1,2} [^\\s]+ \\d{4}) to (\\d{1,2} [^\\s]+ \\d{4}) · actual ${N}% vs planned ${N}% by today`, "g"),
    "$1: $2 से $3 · वास्तविक $4% बनाम नियोजित $5% (आज तक)"],
  [new RegExp(`${N}% by today`, "g"), "$1% आज तक"],
  [new RegExp(`variance ${N} (?:pts|अंक)`, "g"), "अंतर $1 अंक"],
  [new RegExp(`Budget (₹[\\d.,]+ ?[A-Za-z]*)   •   Spent (₹[\\d.,]+ ?[A-Za-z]*) \\(${N}% of budget\\)   •   CPI ${N}`, "g"),
    "बजट $1   •   खर्च $2 (बजट का $3%)   •   CPI $4"],
  [new RegExp(`Budget (₹[\\d.,]+ ?[A-Za-z]*) · CPI ${N}`, "g"), "बजट $1 · CPI $2"],
  [new RegExp(`${N}% of budget used`, "g"), "बजट का $1% उपयोग"],
  [/Over budget by (₹[\d.,]+ ?[A-Za-z]*) at current CPI/g, "वर्तमान CPI पर बजट से $1 ज़्यादा"],
  [/Under budget by (₹[\d.,]+ ?[A-Za-z]*) at current CPI/g, "वर्तमान CPI पर बजट से $1 कम"],
  [new RegExp(`(\\d+) incidents? logged`, "g"), "$1 घटनाएँ दर्ज"],
  [new RegExp(`(\\d+) (?:दिन|days?) since the last incident`, "g"), "पिछली घटना को $1 दिन हुए"],
  [new RegExp(`Based on ([\\d,]+) reported man-days`, "g"), "$1 दर्ज मानव-दिवसों के आधार पर"],
  [new RegExp(`${N}% done vs ${N}% planned \\(${N} (?:pts|अंक)\\)`, "g"), "$1% पूरा बनाम $2% नियोजित ($3 अंक)"],
  [/Last log (.+?) — (\d+) (?:दिन|days?)\./g, "आख़िरी लॉग $1 — $2 दिन पहले।"],
  [new RegExp(`Based on (\\d+) progress report\\(s\\)`, "g"), "$1 प्रगति रिपोर्टों के आधार पर"],
  [new RegExp(`(\\d+) changes? since the last backup`, "g"), "पिछले बैकअप के बाद $1 बदलाव"],
  [/(\d+) reports? · (\d+) (?:गतिविधियाँ|activities) · (\d+) costs? · (\d+) incidents?/g, "$1 रिपोर्टें · $2 गतिविधियाँ · $3 लागतें · $4 घटनाएँ"],
  [/(\d+) projects?, (\d+) (?:दैनिक रिपोर्ट|daily reports?)/g, "$1 प्रोजेक्ट, $2 दैनिक रिपोर्ट"],
  [/Counted from photos \(on-device AI: (.+?)\): (\d+) workers, (\d+) machines, (low|medium|high) confidence/g,
    (_m: string, ai: string, w: string, mc: string, c: string) => `फ़ोटो से गिना गया (डिवाइस पर AI: ${ai}): ${w} मज़दूर, ${mc} मशीनें, ${c === "low" ? "कम" : c === "high" ? "ज़्यादा" : "मध्यम"} भरोसा`],
  [/Counts include an estimate from (\d+) site photo\(s\) via on-device AI: (.+?): (\d+) workers, (\d+) machines \((low|medium|high) confidence\)/g,
    (_m: string, n: string, ai: string, w: string, mc: string, c: string) => `गिनती में ${n} साइट फ़ोटो से डिवाइस पर AI (${ai}) का अनुमान शामिल है: ${w} मज़दूर, ${mc} मशीनें (${c === "low" ? "कम" : c === "high" ? "ज़्यादा" : "मध्यम"} भरोसा)`],
  [/(\d+) workers\b/g, "$1 मज़दूर"],
  [/(\d+) machines\b/g, "$1 मशीनें"],
  // "<incident type> on <date>: <description>" and "<activity> alert titles": translate the name/description pieces too
  [/^(Near miss|First aid|Medical treatment|Lost-time injury|Property \/ equipment damage|Environmental|Other) on (.+?): (.+)$/,
    (_m: string, ty: string, d: string, desc: string) => `${_tr(ty)} — ${_tr(d)}: ${_tr(desc)}`],
  [/^Activity delayed: (.+)$/, (_m: string, n: string) => `गतिविधि में देरी: ${_tr(n)}`],
  [/^Activity at risk: (.+)$/, (_m: string, n: string) => `जोखिम में गतिविधि: ${_tr(n)}`],
  [/^No progress logged: (.+)$/, (_m: string, n: string) => `कोई प्रगति दर्ज नहीं: ${_tr(n)}`],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/, (_m: string, mo: string, y: string) => `${({ Jan: "जनवरी", Feb: "फ़रवरी", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुलाई", Aug: "अगस्त", Sep: "सितंबर", Oct: "अक्तूबर", Nov: "नवंबर", Dec: "दिसंबर" } as any)[mo]} ${y}`],
  // names / notes written by the user (or the demo project) inside generated lines
  [/^(.+?): \+([\d.,]+) (\S+) \((.*)\)$/, (_m: string, nm: string, q: string, u: string, note: string) => {
    const n2 = note.replace(/^(Ch\. \S+) to (\S+)(?: — (.+))?$/, (_x: string, a: string, b: string, d: string) => `${a} से ${b}${d ? " — " + _tr(d) : ""}`);
    return `${_tr(nm)}: +${q} ${u} (${n2 === note ? _tr(note) : n2})`;
  }],
  [/^(\d{1,2} [A-Za-z]{3,4} \d{4}): (.+)$/, (_m: string, d: string, desc: string) => `${_tr(d)}: ${_tr(desc)}`],
  [/^Remarks: (.+)$/, (_m: string, r: string) => `टिप्पणियाँ: ${_tr(r)}`],
  [/\((budget|equal)-weighted\)/g, (_m: string, w: string) => `(${w === "budget" ? "बजट" : "बराबर"}-भारित)`],
  [/Pune Ring Road · Pkg 04 \(Demo\)/g, "पुणे रिंग रोड · पैकेज 04 (डेमो)"],
  [new RegExp(`\\(${N}% of budget\\)`, "g"), "(बजट का $1%)"],
  [/(₹[\d.,]+) Cr\b/g, "$1 करोड़"],
  [/(₹[\d.,]+) L\b/g, "$1 लाख"],
];

/* ---- bulk pairs: plain strings become exact matches; strings with {0} slots become anchored templates ---- */
const escRx = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CONF: Record<string, string> = { low: "कम", medium: "मध्यम", high: "ज़्यादा", budget: "बजट", equal: "बराबर" };
const trPiece = (x: string) => (CONF[x] !== undefined ? CONF[x] : /[A-Za-z]{2}/.test(x) ? _tr(x) : x);

export const I18N_PAIR_EXACT: Record<string, string> = {};
export const I18N_PAIR_TPL: { rx: RegExp; hi: string; lit: string; w: number }[] = [];
for (const [en, hi] of I18N_PAIRS) {
  if (!/\{\d+\}/.test(en)) { I18N_PAIR_EXACT[en] = hi; continue; }
  const parts = en.split(/\{\d+\}/);
  let src = "^" + escRx(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    // a slot glued to a letter ("day{1}", "activit{1}") is a plural suffix: a few characters at most
    const plural = /[A-Za-z]$/.test(parts[i - 1]);
    src += (plural ? "([A-Za-z()]{0,4})" : "([\\s\\S]{0,90}?)") + escRx(parts[i]);
  }
  const rx = new RegExp(src + "$");
  const lit = parts.reduce((a, b) => (b.length > a.length ? b : a), "");
  I18N_PAIR_TPL.push({ rx, hi, lit, w: parts.join("").length });
}
// most literal text first, so the most specific template wins
I18N_PAIR_TPL.sort((a, b) => b.w - a.w);
export function tplHi(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ");
  for (const { rx, hi, lit } of I18N_PAIR_TPL) {
    if (lit && !t.includes(lit)) continue;
    const m = rx.exec(t);
    if (m) return hi.replace(/\{(\d+)\}/g, (_m, i) => (m[+i + 1] === undefined ? "" : trPiece(m[+i + 1])));
  }
  return null;
}
