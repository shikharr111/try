// @ts-nocheck
"use client";
/* InfraTrack workspace UI. Ported from the supplied single-file app; sign-in is handled by the existing Supabase
   cookie session (see /login), so the in-file login flow was removed. Cloud data lives in the it_* tables. */
import * as XLSX from "xlsx";
import { useBackdrop } from "./useBackdrop";
import { answerQuestion } from "@/lib/copilot/answer";
import { createBrowserClient } from "@supabase/ssr";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  LayoutGrid, FolderKanban, Camera, GitMerge, Table2, AlertTriangle, Waypoints,
  MapPin, History, FileText, Users, Boxes, Sparkles, TrendingUp, Bell, Shield,
  Search, Sun, Moon, ChevronDown, ChevronRight, X, Check, Upload, Clock,
  CircleCheck, CircleAlert, CircleX, Filter, Download, Plus, ArrowUpRight, ArrowLeft,
  ArrowDownRight, Wrench, Truck, HardHat, Send, Bot, ChevronLeft, Building2,
  Radio, Link2, ShieldCheck, BadgeCheck, ClipboardList, Layers,
  Mic, Play, Pause, Waves, ScanLine, GitCompareArrows, CloudMoon, ArrowRight, LogOut, Copy,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, Navigation, RefreshCw,
  Video, Square, CircleDot, SwitchCamera, VideoOff, CalendarDays, Trash2, Pencil, Wallet, ListChecks, CloudSun, Info
} from "lucide-react";
import { parseVoiceEntry } from "@/lib/voice/parseVoiceEntry";
import SiteCamera from "./SiteCamera";
import { I18N_EXACT, I18N_RX_EXTRA } from "./i18nHi";
import { I18N_EXACT2, I18N_RX_FIRST, I18N_PAIR_EXACT, tplHi, setTrHi } from "./i18nHi2";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell, Legend,
} from "recharts";

/* =========================================================================
   THEME TOKENS
   Subject: enterprise infrastructure execution-intelligence platform.
   Base: deep slate/navy worksite tones. Accent: signal amber (survey-stake /
   safety-marking amber), not the common terracotta/green AI defaults.
   Numeric/data labels use a monospace face (JetBrains-style stack) because
   this is a genuinely tabular, ID-heavy engineering data product.
   ========================================================================= */
const THEME = {
  /* Palette taken from the supplied "Natural Home Decor" web template: warm cream page, charcoal bars, mid-grey buttons. */
  dark: {
    bg: "#262626", bgElevated: "#1F1F1F", panel: "#2F2F2F", panelAlt: "#393939", border: "#474747", borderSoft: "#3A3A3A",
    text: "#F5F1E8", textMuted: "#BAB5AA", textFaint: "#8E8A81",
    accent: "#E9E2D3", accentSoft: "#3B3A36", onAccent: "#222222",
    blue: "#8FA6B5", blueSoft: "#2F3A41", green: "#8DBB86", greenSoft: "#2F3B2D",
    red: "#D98570", redSoft: "#43302B", violet: "#B2A3C8", warn: "#D9B46A", warnSoft: "#433A27",
  },
  light: {
    bg: "#F5F1E8", bgElevated: "#FAF7F0", panel: "#FAF7F0", panelAlt: "#EEE9DD", border: "#D9D2C2", borderSoft: "#E6E0D2",
    text: "#2B2B2B", textMuted: "#6F6B63", textFaint: "#9B968B",
    accent: "#4A4A4A", accentSoft: "#E9E4D8", onAccent: "#FFFFFF",
    blue: "#6C8191", blueSoft: "#E3E8EA", green: "#5B8556", greenSoft: "#E3EBDD",
    red: "#B2503A", redSoft: "#F2E0DA", violet: "#85749A", warn: "#9A6B1F", warnSoft: "#F1E6CF",
  },
};
/* The top bar, sidebar and bottom nav are always charcoal (like the template's header and footer), in both modes. */
const NAV_THEME = { ...THEME.dark, bg: "#222222", bgElevated: "#222222", panel: "#2C2C2C", panelAlt: "#363636", border: "#3C3C3C", borderSoft: "#333333" };
const FONT_UI = "'Open Sans', 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "'Open Sans', 'Segoe UI', system-ui, sans-serif";

/* =========================================================================
   BRAND MARK — InfraTrack
   A tracked route line rising to a locked checkpoint node: the read on
   planned-vs-actual progress that the product is built around, not a
   generic sparkle/bolt AI mark.
   ========================================================================= */
function InfraTrackLogo({ size = 30, radius = 8, bg, fg = "#222222", glow, className, animatePath }) {
  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: radius, background: bg, flexShrink: 0,
      display: "grid", placeItems: "center", boxShadow: glow ? `0 0 0 0 ${glow}` : undefined,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M2.5 17.5 L8.5 10.5 L13 14 L21.5 4.5" stroke={fg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={animatePath ? "3 4" : undefined}
          style={animatePath ? { } : undefined} />
        <path d="M16.5 4.5 L21.5 4.5 L21.5 9.5" stroke={fg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="2.5" cy="17.5" r="1.7" fill={fg} opacity="0.5" />
      </svg>
      {animatePath && <style>{`@keyframes bsLogoDash { to { stroke-dashoffset: -28; } }`}</style>}
    </div>
  );
}

/* =========================================================================
   MOCK DATA
   ========================================================================= */
function seedRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rnd = seedRandom(42);
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function hexAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}
function genTeamCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

/* ---- Live site weather → schedule-delay risk mapping (WMO weather codes) ---- */
const WEATHER_CODE_MAP = {
  0: { label: "Clear sky", Icon: Sun, risk: "low" },
  1: { label: "Mainly clear", Icon: Sun, risk: "low" },
  2: { label: "Partly cloudy", Icon: Cloud, risk: "low" },
  3: { label: "Overcast", Icon: Cloud, risk: "low" },
  45: { label: "Fog", Icon: CloudFog, risk: "moderate" },
  48: { label: "Freezing fog", Icon: CloudFog, risk: "moderate" },
  51: { label: "Light drizzle", Icon: CloudDrizzle, risk: "low" },
  53: { label: "Drizzle", Icon: CloudDrizzle, risk: "moderate" },
  55: { label: "Dense drizzle", Icon: CloudDrizzle, risk: "moderate" },
  56: { label: "Freezing drizzle", Icon: CloudDrizzle, risk: "moderate" },
  57: { label: "Freezing drizzle", Icon: CloudDrizzle, risk: "moderate" },
  61: { label: "Slight rain", Icon: CloudRain, risk: "moderate" },
  63: { label: "Moderate rain", Icon: CloudRain, risk: "high" },
  65: { label: "Heavy rain", Icon: CloudRain, risk: "severe" },
  66: { label: "Freezing rain", Icon: CloudRain, risk: "high" },
  67: { label: "Heavy freezing rain", Icon: CloudRain, risk: "severe" },
  71: { label: "Slight snow", Icon: CloudSnow, risk: "moderate" },
  73: { label: "Moderate snow", Icon: CloudSnow, risk: "high" },
  75: { label: "Heavy snow", Icon: CloudSnow, risk: "severe" },
  77: { label: "Snow grains", Icon: CloudSnow, risk: "moderate" },
  80: { label: "Rain showers", Icon: CloudRain, risk: "moderate" },
  81: { label: "Rain showers", Icon: CloudRain, risk: "high" },
  82: { label: "Violent rain showers", Icon: CloudRain, risk: "severe" },
  85: { label: "Snow showers", Icon: CloudSnow, risk: "high" },
  86: { label: "Heavy snow showers", Icon: CloudSnow, risk: "severe" },
  95: { label: "Thunderstorm", Icon: CloudLightning, risk: "severe" },
  96: { label: "Thunderstorm, hail", Icon: CloudLightning, risk: "severe" },
  99: { label: "Thunderstorm, heavy hail", Icon: CloudLightning, risk: "severe" },
};
const DELAY_BY_RISK = {
  low: { days: "No delay expected", text: "Conditions are favorable — pours, earthwork and material hauling can proceed as scheduled." },
  moderate: { days: "0.5–1 day potential delay", text: "Minor slowdown likely — reduced visibility or light rain may affect curing, surveys and open excavation." },
  high: { days: "1–2 day potential delay", text: "Meaningful delay risk — concrete pours, earthwork and hauling should be re-sequenced or buffered." },
  severe: { days: "2–4 day potential delay", text: "High delay risk — pause high-risk activities (pours, crane operations, deep excavation) until conditions clear." },
};
function weatherInfo(code, windspeed) {
  const base = WEATHER_CODE_MAP[code] || { label: "Unknown conditions", Icon: Cloud, risk: "low" };
  let risk = base.risk;
  if (windspeed >= 55) risk = "severe";
  else if (windspeed >= 40 && (risk === "low" || risk === "moderate")) risk = "high";
  return { ...base, risk };
}

/* =========================================================================
   PRIMITIVES
   ========================================================================= */
function useCountUp(target) {
  return target;
}

function StatusBadge({ status, theme }) {
  const map = {
    "Ahead": { c: theme.green, bg: theme.greenSoft },
    "On Track": { c: theme.blue, bg: theme.blueSoft },
    "At Risk": { c: theme.warn, bg: theme.warnSoft },
    "Delayed": { c: theme.red, bg: theme.redSoft },
    "Verified": { c: theme.green, bg: theme.greenSoft },
    "Matched": { c: theme.blue, bg: theme.blueSoft },
    "Pending Review": { c: theme.warn, bg: theme.warnSoft },
    "Critical": { c: theme.red, bg: theme.redSoft },
    "High": { c: theme.warn, bg: theme.warnSoft },
    "Medium": { c: theme.blue, bg: theme.blueSoft },
    "Completed": { c: theme.green, bg: theme.greenSoft },
    "Open": { c: theme.warn, bg: theme.warnSoft },
    "Closed": { c: theme.green, bg: theme.greenSoft },
  };
  const s = map[status] || { c: theme.textMuted, bg: theme.panelAlt };
  return (
    <span style={{
      color: s.c, background: s.bg, fontFamily: FONT_UI, fontSize: 12, fontWeight: 700,
      padding: "3px 9px", borderRadius: 3, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.c, display: "inline-block" }} />
      {status}
    </span>
  );
}

function Card({ theme, children, style, className, ...rest }) {
  return (
    <div
      className={className}
      style={{
        background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3,
        padding: 18, ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function SectionTitle({ theme, title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.text }}>{title}</div>
        {sub && <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function KPICard({ theme, label, value, unit, delta, deltaGood, icon: Icon, onClick, active, interactive }) {
  const numeric = typeof value === "number";
  const shown = useCountUp(numeric ? value : 0, 1000);
  return (
    <Card
      theme={theme}
      onClick={onClick}
      className={interactive ? "bs-card-interactive" : undefined}
      style={{
        minWidth: 0, position: "relative",
        borderColor: active ? theme.accent : theme.border,
        background: active ? theme.panelAlt : theme.panel,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, fontWeight: 600 }}>{label}</div>
        {Icon && <Icon size={15} color={active ? theme.accent : theme.textFaint} />}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 27, fontWeight: 700, color: theme.text, marginTop: 10, letterSpacing: -0.5 }}>
        {numeric ? shown.toFixed(1) : value}{unit}
      </div>
      {delta !== undefined && (
        <div style={{
          display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600,
          color: deltaGood ? theme.green : theme.red,
        }}>
          {deltaGood ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {delta}
        </div>
      )}
      {interactive && (
        <ChevronDown size={12} color={theme.textFaint} style={{
          position: "absolute", top: 14, right: 14, opacity: 0,
          transform: active ? "rotate(180deg)" : "rotate(0deg)",
          }} className="bs-kpi-chevron" />
      )}
    </Card>
  );
}

const MOBILE_CSS = `
@media (max-width: 820px) {
  [style*="grid-template-columns"]:not(.bs-keep-grid) { grid-template-columns: minmax(0, 1fr) !important; }
  [style*="repeat(3"]:not(.bs-keep-grid), [style*="repeat(4"]:not(.bs-keep-grid), [style*="repeat(5"]:not(.bs-keep-grid), [style*="repeat(6"]:not(.bs-keep-grid) { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  button, select { min-height: 42px; }
  input, select, textarea { font-size: 16px !important; min-height: 42px; }
  table { display: block; overflow-x: auto; max-width: 100%; }
}`;
if (typeof document !== "undefined" && !document.getElementById("bs-mobile-css")) {
  const st2 = document.createElement("style"); st2.id = "bs-mobile-css"; st2.textContent = MOBILE_CSS; document.head.appendChild(st2);
}
/* PWA: meta tags now; the manifest + service worker are enabled only when /sw.js exists (HTTPS or localhost) */
(function registerPWA() {
  if (typeof window === "undefined") return;
  try {
    const add = (tag, attrs) => { const el = document.createElement(tag); Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k])); document.head.appendChild(el); };
    if (!document.querySelector('meta[name="theme-color"]')) add("meta", { name: "theme-color", content: "#222222" });
    add("meta", { name: "mobile-web-app-capable", content: "yes" });
    add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    add("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").then(() => {
        if (!document.querySelector('link[rel="manifest"]')) { add("link", { rel: "manifest", href: "/manifest.webmanifest" }); add("link", { rel: "apple-touch-icon", href: "/icon-192.png" }); }
      }).catch(() => {});
    }
  } catch (e) {}
})();
/* =========================================================================
   LANGUAGE (English / Hindi): a runtime translator. Add or fix words in I18N_HI below; anything missing simply stays in English.
   ========================================================================= */
const I18N_HI = {"Connecting Plans to Reality": "योजनाओं को हकीकत से जोड़ना", "PLAN vs ACTUAL": "योजना बनाम वास्तविक", "Notifications": "सूचनाएँ", "No notifications yet. New high or critical alerts from your data appear here.": "अभी कोई सूचना नहीं। आपके डेटा से नए गंभीर अलर्ट यहाँ दिखेंगे।", "Copied": "कॉपी हो गया", "Copy": "कॉपी", "Share this code — anyone who enters it joins your team.": "यह कोड साझा करें — इसे डालने वाला हर व्यक्ति आपकी टीम से जुड़ जाएगा।", "Join": "जुड़ें", "Leave": "छोड़ें", "Team sync isn't connected to a server, so other members can't appear here yet.": "टीम सिंक सर्वर से जुड़ा नहीं है, इसलिए अन्य सदस्य यहाँ अभी नहीं दिखेंगे।", "Add New Project": "नया प्रोजेक्ट जोड़ें", "Search pages, activities, contractors…": "पेज, गतिविधियाँ, ठेकेदार खोजें…", "LIVE PROJECT FEED": "लाइव प्रोजेक्ट फ़ीड", "Site local time": "साइट का स्थानीय समय", "Refresh": "रीफ़्रेश", "Try again": "फिर कोशिश करें", "Working days per week": "सप्ताह में कार्य दिवस", "Planned workers per day": "प्रतिदिन नियोजित श्रमिक", "Planned machines per day": "प्रतिदिन नियोजित मशीनें", "Monthly plan": "मासिक योजना", "Enter a Start Date and a Planned Completion Date to see the month-by-month plan.": "महीने-दर-महीने योजना देखने के लिए प्रारंभ तिथि और नियोजित समापन तिथि भरें।", "Start Date": "प्रारंभ तिथि", "Planned Completion Date": "नियोजित समापन तिथि", "Save Plan": "योजना सहेजें", "Cancel": "रद्द करें", "Count workers and machines from site photos": "साइट की फ़ोटो से श्रमिक और मशीनें गिनें", "Sensitivity": "संवेदनशीलता", "Flip": "पलटें", "Live camera": "लाइव कैमरा", "Save to this date's report automatically": "इस तारीख की रिपोर्ट में अपने आप सहेजें", "Edit Plan": "योजना बदलें", "Loading saved plan data…": "सहेजा हुआ योजना डेटा लोड हो रहा है…", "No planned data for this project yet": "इस प्रोजेक्ट के लिए अभी कोई नियोजित डेटा नहीं है", "Add Planned Data": "नियोजित डेटा जोड़ें", "REASONS LOGGED ON BEHIND-PLAN DAYS": "योजना से पीछे रहने के दिनों के कारण", "No daily entries yet.": "अभी कोई दैनिक प्रविष्टि नहीं।", "Date": "तारीख", "Actual workers on site": "साइट पर वास्तविक श्रमिक", "Actual machines working": "काम करती वास्तविक मशीनें", "None": "कोई नहीं", "Not noted": "दर्ज नहीं", "Remarks": "टिप्पणियाँ", "Cancel edit": "बदलाव रद्द करें", "Daily": "दैनिक", "Monthly": "मासिक", "Export CSV": "CSV निर्यात करें", "No actual data entered yet.": "अभी कोई वास्तविक डेटा दर्ज नहीं।", "Show 30 more": "30 और दिखाएँ", "Save Project": "प्रोजेक्ट सहेजें", "Load demo project instead": "इसके बजाय डेमो प्रोजेक्ट लोड करें", "All projects are on schedule": "सभी प्रोजेक्ट समय पर हैं", "Save Activity": "गतिविधि सहेजें", "Save Log": "लॉग सहेजें", "Add Activity": "गतिविधि जोड़ें", "Add First Activity": "पहली गतिविधि जोड़ें", "Log": "लॉग", "No activities with this status.": "इस स्थिति की कोई गतिविधि नहीं।", "No progress logged yet for this activity.": "इस गतिविधि की अभी कोई प्रगति दर्ज नहीं।", "Cumulative": "संचयी", "Nothing to plot yet — add a budget to the plan or record a cost.": "अभी दिखाने को कुछ नहीं — योजना में बजट जोड़ें या कोई लागत दर्ज करें।", "Add Cost": "लागत जोड़ें", "No costs recorded yet.": "अभी कोई लागत दर्ज नहीं।", "Safety incidents": "सुरक्षा घटनाएँ", "Weather & delay log": "मौसम और देरी का लॉग", "Log Incident": "घटना दर्ज करें", "No incidents logged.": "कोई घटना दर्ज नहीं।", "Go to daily report": "दैनिक रिपोर्ट पर जाएँ", "No lost hours tagged with a weather condition.": "किसी मौसम से जुड़े खोए घंटे दर्ज नहीं।", "No lost hours tagged with a reason.": "किसी कारण से जुड़े खोए घंटे दर्ज नहीं।", "No alerts from the data entered so far.": "अब तक के डेटा से कोई अलर्ट नहीं।", "Open Delay Detection": "देरी की पहचान खोलें", "Add Project": "प्रोजेक्ट जोड़ें", "Load Demo Project": "डेमो प्रोजेक्ट लोड करें", "Save": "सहेजें", "No status": "कोई स्थिति नहीं", "vs planned": "बनाम योजना", "Go to Activities": "गतिविधियों पर जाएँ", "ACTIVITY": "गतिविधि", "TODAY": "आज", "Excel report": "Excel रिपोर्ट", "Download Excel": "Excel डाउनलोड करें", "Share with the client or your team": "क्लाइंट या टीम के साथ साझा करें", "WhatsApp message": "WhatsApp संदेश", "Email": "ईमेल", "Copy summary": "सारांश कॉपी करें", "Timeline": "टाइमलाइन", "Share report": "रिपोर्ट साझा करें", "Share PDF": "PDF साझा करें", "Download PDF": "PDF डाउनलोड करें", "Download report (PDF)": "रिपोर्ट डाउनलोड करें (PDF)", "PDF report (with graphs)": "PDF रिपोर्ट (ग्राफ़ सहित)", "Back up now": "अभी बैकअप लें", "Forecast": "पूर्वानुमान", "Add planned data to draw the planned curve.": "नियोजित कर्व बनाने के लिए नियोजित डेटा जोड़ें।", "All delays": "सभी देरियाँ", "Open": "खोलें", "Add activities like Earthwork or Paving to see which ones are on track.": "मिट्टी का काम या पेविंग जैसी गतिविधियाँ जोड़ें, ताकि पता चले कौन-सी समय पर हैं।", "Edit details": "विवरण बदलें", "Add planned dates to compare elapsed time with progress.": "बीते समय की प्रगति से तुलना के लिए नियोजित तारीखें जोड़ें।", "Go to Plan vs Actual": "योजना बनाम वास्तविक पर जाएँ", "No delay signal in the data entered so far.": "अब तक के डेटा में देरी का कोई संकेत नहीं।", "Open activities": "गतिविधियाँ खोलें", "Behind-plan days by reason": "योजना से पीछे के दिन, कारण के अनुसार", "No reasons logged on behind-plan days.": "पीछे रहने वाले दिनों के कारण दर्ज नहीं।", "Hours lost by reason": "कारण के अनुसार खोए घंटे", "No changes recorded yet.": "अभी कोई बदलाव दर्ज नहीं।", "InfraTrack Copilot": "InfraTrack सहायक", "No matches found.": "कोई मेल नहीं मिला।", "Search spans pages, this project's activities and contractors, and your projects.": "खोज में पेज, इस प्रोजेक्ट की गतिविधियाँ और ठेकेदार, और आपके प्रोजेक्ट शामिल हैं।", "Sync now": "अभी सिंक करें", "Reload from cloud": "क्लाउड से दोबारा लोड करें", "This browser has data from before you signed in": "इस ब्राउज़र में साइन-इन से पहले का डेटा है", "Upload to my account": "मेरे खाते में अपलोड करें", "Uploaded — the data is now being saved to your account.": "अपलोड हो गया — डेटा अब आपके खाते में सहेजा जा रहा है।", "Everything saved in this browser is already in your account.": "इस ब्राउज़र में सहेजा सब कुछ पहले से आपके खाते में है।", "Copy backup text": "बैकअप टेक्स्ट कॉपी करें", "Choose backup file…": "बैकअप फ़ाइल चुनें…", "or": "या", "Read pasted text": "चिपकाया टेक्स्ट पढ़ें", "Contents": "सामग्री", "In backup": "बैकअप में", "In app now": "अभी ऐप में", "Merge": "मिलाएँ", "Replace": "बदलें", "Merge into current data": "मौजूदा डेटा में मिलाएँ", "Replace everything…": "सब कुछ बदलें…", "Yes, replace all current data": "हाँ, सारा मौजूदा डेटा बदलें", "Sign in to your workspace": "अपने वर्कस्पेस में साइन इन करें", "Your projects are saved to your account and visible only to you.": "आपके प्रोजेक्ट आपके खाते में सहेजे जाते हैं और सिर्फ़ आपको दिखते हैं।", "Password": "पासवर्ड", "Enter your email and password.": "अपना ईमेल और पासवर्ड भरें।", "Signing in": "साइन इन हो रहा है", "Sign in": "साइन इन", "Each account can only read and change its own data.": "हर खाता सिर्फ़ अपना डेटा देख और बदल सकता है।", "First time here?": "यहाँ पहली बार?", "Create an account": "खाता बनाएँ", "Create your workspace account": "अपना वर्कस्पेस खाता बनाएँ", "Set up your profile once — your role decides what you see.": "प्रोफ़ाइल एक बार बनाएँ — आपकी भूमिका तय करती है कि आपको क्या दिखेगा।", "Full name": "पूरा नाम", "Work email": "कार्य ईमेल", "Organization": "संगठन", "Confirm": "पुष्टि करें", "Passwords don't match.": "पासवर्ड मेल नहीं खाते।", "Creating account": "खाता बन रहा है", "Create account & continue": "खाता बनाएँ और आगे बढ़ें", "Already have an account?": "पहले से खाता है?", "Signed in as": "साइन इन:", "Enter workspace": "वर्कस्पेस में जाएँ", "Not you? Sign in again": "आप नहीं हैं? फिर साइन इन करें", "Plan vs actual tracking": "योजना बनाम वास्तविक ट्रैकिंग", "Execution intelligence, on site": "साइट पर कार्यान्वयन की समझ", "Every excavation, pour and delay — tracked before the report lands.": "हर खुदाई, ढलाई और देरी — रिपोर्ट आने से पहले ही ट्रैक।", "Try again now": "अभी फिर कोशिश करें", "Delete project": "प्रोजेक्ट हटाएँ", "Workspace failed to load": "वर्कस्पेस लोड नहीं हो सका", "Profile": "प्रोफ़ाइल", "Have a code? Enter it": "कोड है? यहाँ डालें", "Toggle theme": "थीम बदलें", "Log out": "लॉग आउट", "Live Site Weather & Delay Risk": "साइट का लाइव मौसम और देरी का जोखिम", "Remove photo": "फ़ोटो हटाएँ", "Take photo": "फ़ोटो लें", "Planned vs Actual Tracker": "योजना बनाम वास्तविक ट्रैकर", "Delay detection": "देरी की पहचान", "Planned vs actual trend": "योजना बनाम वास्तविक रुझान", "Planned": "नियोजित", "Actual": "वास्तविक", "Optional notes": "वैकल्पिक नोट्स", "Planned vs actual comparison": "योजना बनाम वास्तविक तुलना", "Not a planned working day": "नियोजित कार्य दिवस नहीं", "Edit report": "रिपोर्ट बदलें", "Delete report": "रिपोर्ट हटाएँ", "Activity name *": "गतिविधि का नाम *", "Planned quantity *": "नियोजित मात्रा *", "Unit": "इकाई", "Planned start *": "नियोजित प्रारंभ *", "Planned finish *": "नियोजित समाप्ति *", "Who executes this activity": "यह गतिविधि कौन करवा रहा है", "Activities — Planned vs Actual": "गतिविधियाँ — योजना बनाम वास्तविक", "No activities yet": "अभी कोई गतिविधि नहीं", "Overall progress": "कुल प्रगति", "Delayed": "देरी में", "At risk": "जोखिम में", "Completed": "पूर्ण", "Full planned quantity logged": "पूरी नियोजित मात्रा दर्ज", "Planned vs actual % by activity": "गतिविधि के अनुसार नियोजित बनाम वास्तविक %", "Planned % is the share of the activity that should be done by today": "नियोजित % यानी आज तक गतिविधि का जितना हिस्सा पूरा होना चाहिए", "Activity register": "गतिविधि रजिस्टर", "Click a row for its quantity curve and log history": "मात्रा कर्व और लॉग इतिहास के लिए पंक्ति पर क्लिक करें", "Delete activity and its logs": "गतिविधि और उसके लॉग हटाएँ", "Delete log": "लॉग हटाएँ", "Cost & Budget": "लागत और बजट", "Planned budget": "नियोजित बजट", "Spent so far": "अब तक खर्च", "Earned value": "अर्जित मूल्य", "Forecast final cost": "अनुमानित अंतिम लागत", "Spend over time": "समय के साथ खर्च", "Record a cost": "लागत दर्ज करें", "Every amount you enter is added to spend, the charts and the CPI": "आपकी दर्ज हर राशि खर्च, चार्ट और CPI में जुड़ती है", "Category": "श्रेणी", "Note": "नोट", "By category": "श्रेणी के अनुसार", "Activity budget vs spend": "गतिविधि बजट बनाम खर्च", "Only costs tagged to an activity are counted here": "यहाँ सिर्फ़ गतिविधि से जुड़ी लागतें गिनी जाती हैं", "Cost entries": "लागत प्रविष्टियाँ", "Delete entry": "प्रविष्टि हटाएँ", "Safety & Site Log": "सुरक्षा और साइट लॉग", "Days since last incident": "पिछली घटना को बीते दिन", "Total / open": "कुल / खुली", "Incidents logged / still open": "दर्ज घटनाएँ / अभी खुली", "Lost-time injuries": "कार्य-समय खोने वाली चोटें", "All time": "अब तक", "Per 10,000 man-days": "प्रति 10,000 मानव-दिवस", "Log an incident": "घटना दर्ज करें", "Near misses count too — they are the early warning": "बाल-बाल बचे मामले भी गिनें — ये पहली चेतावनी हैं", "Type": "प्रकार", "Severity": "गंभीरता", "What happened *": "क्या हुआ *", "Short description, location, action taken": "छोटा विवरण, स्थान, की गई कार्रवाई", "Incident register": "घटना रजिस्टर", "Most recent first": "सबसे नई पहले", "Delete incident": "घटना हटाएँ", "Working hours lost": "खोए कार्य-घंटे", "Rain days": "बारिश के दिन", "Days reported as light or heavy rain": "हल्की या तेज़ बारिश वाले दिन", "Days with weather noted": "मौसम दर्ज वाले दिन", "No weather or lost-hours data yet": "अभी मौसम या खोए घंटों का डेटा नहीं", "Hours lost by weather": "मौसम से खोए घंटे", "Hours lost": "खोए घंटे", "Hours lost by delay reason": "देरी के कारण से खोए घंटे", "Daily site log": "दैनिक साइट लॉग", "Project health": "प्रोजेक्ट की सेहत", "No project yet": "अभी कोई प्रोजेक्ट नहीं", "Edit project details": "प्रोजेक्ट विवरण बदलें", "Planned vs actual by period": "अवधि के अनुसार योजना बनाम वास्तविक", "Compare each day, week or month with the plan and see where delay starts": "हर दिन, सप्ताह या महीने की योजना से तुलना करें और देखें देरी कहाँ से शुरू हुई", "Cumulative variance": "संचयी अंतर", "Days behind": "पीछे के दिन", "Install InfraTrack as an app": "InfraTrack को ऐप की तरह इंस्टॉल करें", "Activities": "गतिविधियाँ", "Project Report": "प्रोजेक्ट रिपोर्ट", "Project Report (PDF/Excel)": "प्रोजेक्ट रिपोर्ट (PDF/Excel)", "Nothing to report yet": "अभी रिपोर्ट के लिए कुछ नहीं", "Add the plan and a few daily reports first. The report fills itself from them.": "पहले योजना और कुछ दैनिक रिपोर्ट जोड़ें। रिपोर्ट उन्हीं से अपने आप बनती है।", "No data entered for this project yet": "इस प्रोजेक्ट का अभी कोई डेटा दर्ज नहीं", "Schedule status": "शेड्यूल की स्थिति", "Forecast completion": "अनुमानित समापन", "Budget": "बजट", "Workforce vs plan": "श्रमिक बनाम योजना", "Open alerts": "खुले अलर्ट", "Average of the signals that have data": "डेटा वाले संकेतों का औसत", "Progress curve": "प्रगति कर्व", "Alerts": "अलर्ट", "Computed from planned vs actual — sorted by severity": "योजना बनाम वास्तविक से गणना — गंभीरता के क्रम में", "All projects": "सभी प्रोजेक्ट", "Each row is computed from that project's own entries": "हर पंक्ति उस प्रोजेक्ट की अपनी प्रविष्टियों से बनी है", "Project Overview": "प्रोजेक्ट ओवरव्यू", "Project details": "प्रोजेक्ट विवरण", "Time vs progress": "समय बनाम प्रगति", "Data checklist": "डेटा चेकलिस्ट", "The more you enter, the more complete every page becomes": "जितना ज़्यादा भरेंगे, हर पेज उतना पूरा बनेगा", "Delay Detection": "देरी की पहचान", "Nothing to analyse yet": "अभी विश्लेषण के लिए कुछ नहीं", "Delayed activities": "देरी वाली गतिविधियाँ", "All alerts": "सभी अलर्ट", "Click an alert to open the page where it comes from": "अलर्ट पर क्लिक करके उसका स्रोत पेज खोलें", "Progress variance per report": "हर रिपोर्ट के अनुसार प्रगति का अंतर", "Delayed and at-risk activities": "देरी और जोखिम वाली गतिविधियाँ", "Why work is slipping": "काम क्यों पिछड़ रहा है", "From the delay reasons logged in daily reports": "दैनिक रिपोर्ट में दर्ज देरी के कारणों से", "Contractor Performance": "ठेकेदार का प्रदर्शन", "No contractor data yet": "अभी ठेकेदार का डेटा नहीं", "Average activity progress": "गतिविधियों की औसत प्रगति", "Planned % vs actual % across each contractor's activities, today": "आज हर ठेकेदार की गतिविधियों में नियोजित % बनाम वास्तविक %", "Scorecard": "स्कोरकार्ड", "Resource Analytics": "संसाधन विश्लेषण", "No resource data yet": "अभी संसाधन का डेटा नहीं", "Avg workers / day": "औसत श्रमिक / दिन", "Avg machines / day": "औसत मशीनें / दिन", "Actual vs planned": "वास्तविक बनाम नियोजित", "Workforce utilisation": "श्रमिक उपयोग", "Actual man-days ÷ planned man-days on reported days": "रिपोर्ट किए दिनों में वास्तविक मानव-दिवस ÷ नियोजित मानव-दिवस", "Total man-days reported": "कुल दर्ज मानव-दिवस", "Man-days by month": "महीने के अनुसार मानव-दिवस", "Planned man-days are counted only for the days actually reported": "नियोजित मानव-दिवस सिर्फ़ रिपोर्ट किए गए दिनों के गिने जाते हैं", "Biggest workforce shortfalls": "सबसे बड़ी श्रमिक कमी", "Days where fewer workers than planned were on site": "वे दिन जब योजना से कम श्रमिक साइट पर थे", "Predictive Completion": "अनुमानित समापन", "Not enough data to forecast": "पूर्वानुमान के लिए पर्याप्त डेटा नहीं", "Current pace": "मौजूदा रफ़्तार", "Plan, actual and projection": "योजना, वास्तविक और अनुमान", "The dotted line continues at the average pace achieved so far": "बिंदु वाली रेखा अब तक की औसत रफ़्तार से आगे बढ़ती है", "Projected": "अनुमानित", "What it takes to finish on the planned date": "नियोजित तारीख पर पूरा करने के लिए क्या चाहिए", "Activity forecasts": "गतिविधि पूर्वानुमान", "Pace per activity since its planned start": "नियोजित प्रारंभ से हर गतिविधि की रफ़्तार", "Daily Progress Report": "दैनिक प्रगति रिपोर्ट", "Every line below comes from an entry you made for this date": "नीचे की हर पंक्ति इस तारीख की आपकी प्रविष्टि से है", "Audit Trail": "ऑडिट ट्रेल", "Change history": "बदलाव का इतिहास", "Ask about this project…": "इस प्रोजेक्ट के बारे में पूछें…", "Search pages, activities, contractors, projects…": "पेज, गतिविधियाँ, ठेकेदार, प्रोजेक्ट खोजें…", "Backup & Restore": "बैकअप और रिस्टोर", "Cloud account": "क्लाउड खाता", "Last backup": "पिछला बैकअप", "Data stored": "सहेजा डेटा", "Where it is saved": "कहाँ सहेजा गया", "Back up": "बैकअप", "Restore": "रिस्टोर", "Paste backup text here": "बैकअप टेक्स्ट यहाँ चिपकाएँ", "Go back": "वापस जाएँ", "Refresh page": "पेज रीफ़्रेश करें", "Delete project?": "प्रोजेक्ट हटाएँ?", "Clear sky": "साफ़ आसमान", "Mainly clear": "ज़्यादातर साफ़", "Partly cloudy": "आंशिक बादल", "Overcast": "घने बादल", "Fog": "कोहरा", "Freezing fog": "जमाने वाला कोहरा", "Light drizzle": "हल्की फुहार", "Drizzle": "फुहार", "Dense drizzle": "घनी फुहार", "Freezing drizzle": "जमाने वाली फुहार", "Slight rain": "हल्की बारिश", "Moderate rain": "मध्यम बारिश", "Heavy rain": "तेज़ बारिश", "Freezing rain": "जमाने वाली बारिश", "Heavy freezing rain": "तेज़ जमाने वाली बारिश", "Slight snow": "हल्की बर्फ़बारी", "Moderate snow": "मध्यम बर्फ़बारी", "Heavy snow": "भारी बर्फ़बारी", "Snow grains": "बर्फ़ के कण", "Rain showers": "बारिश की बौछारें", "Violent rain showers": "तेज़ बौछारें", "Snow showers": "बर्फ़ की बौछारें", "Heavy snow showers": "भारी बर्फ़ की बौछारें", "Thunderstorm": "आँधी-तूफ़ान", "Thunderstorm, hail": "आँधी-तूफ़ान, ओले", "Thunderstorm, heavy hail": "आँधी-तूफ़ान, भारी ओले", "Conditions are favorable — pours, earthwork and material hauling can proceed as scheduled.": "हालात अनुकूल हैं — ढलाई, मिट्टी का काम और माल ढुलाई तय समय पर हो सकती है।", "Unknown conditions": "अज्ञात हालात", "Dashboard": "डैशबोर्ड", "Backup & Cloud": "बैकअप और क्लाउड", "Projected completion later than planned": "अनुमानित समापन योजना से देर से", "Workforce below plan": "श्रमिक योजना से कम", "Machines below plan": "मशीनें योजना से कम", "Reporting gap": "रिपोर्टिंग में अंतर", "No actual data yet": "अभी वास्तविक डेटा नहीं", "No progress data": "प्रगति का डेटा नहीं", "Balanced": "संतुलित", "Budget exceeded": "बजट पार हुआ", "Cost running above earned value": "लागत अर्जित मूल्य से ऊपर चल रही है", "Spending ahead of progress": "खर्च प्रगति से आगे", "Open critical safety incident": "खुली गंभीर सुरक्षा घटना", "Open major safety incident": "खुली बड़ी सुरक्षा घटना", "Lost-time injury in the last 30 days": "पिछले 30 दिनों में कार्य-समय खोने वाली चोट", "Schedule": "शेड्यूल", "Resources": "संसाधन", "Cost": "लागत", "Safety": "सुरक्षा", "Reporting": "रिपोर्टिंग", "More": "और", "WORK PROGRESS": "कार्य प्रगति", "WORKFORCE AND EQUIPMENT": "श्रमिक और उपकरण", "WEATHER AND DELAYS": "मौसम और देरी", "COSTS BOOKED": "दर्ज लागतें", "SAFETY": "सुरक्षा", "Admin": "एडमिन", "Project Manager": "प्रोजेक्ट मैनेजर", "Site Engineer": "साइट इंजीनियर", "Contractor": "ठेकेदार", "Client / Owner": "क्लाइंट / मालिक", "Guest": "अतिथि", "Ahead": "आगे", "On Track": "समय पर", "At Risk": "जोखिम में", "Not started": "शुरू नहीं हुआ", "Critical": "गंभीर", "High": "उच्च", "Medium": "मध्यम", "Low": "कम", "Report ready. If it opened in a new tab, use the browser's save button.": "रिपोर्ट तैयार है। नए टैब में खुली हो तो ब्राउज़र का सेव बटन दबाएँ।", "Could not create the report.": "रिपोर्ट नहीं बन सकी।", "Could not share the report.": "रिपोर्ट साझा नहीं हो सकी।", "Excel report ready. Use the browser's save option if it opened in a tab.": "Excel रिपोर्ट तैयार है। टैब में खुली हो तो ब्राउज़र का सेव विकल्प इस्तेमाल करें।", "Could not create the Excel report.": "Excel रिपोर्ट नहीं बन सकी।", "Report opened in a new tab.": "रिपोर्ट नए टैब में खुली।", "Backup copied. Paste it into a text file and keep it somewhere safe.": "बैकअप कॉपी हो गया। इसे टेक्स्ट फ़ाइल में चिपकाकर सुरक्षित रखें।", "Copy was blocked by the browser — use Download instead.": "ब्राउज़र ने कॉपी रोक दी — डाउनलोड इस्तेमाल करें।", "Your session expired. Please sign in again.": "आपका सत्र समाप्त हो गया। कृपया फिर साइन इन करें।", "Reloaded from the cloud.": "क्लाउड से दोबारा लोड हो गया।", "Project details updated.": "प्रोजेक्ट विवरण अपडेट हुआ।", "Planned data updated.": "नियोजित डेटा अपडेट हुआ।", "Progress log deleted.": "प्रगति लॉग हटाया गया।", "Cost entry deleted.": "लागत प्रविष्टि हटाई गई।", "Incident logged.": "घटना दर्ज हुई।", "Incident deleted.": "घटना हटाई गई।", "Timeline (Gantt)": "टाइमलाइन (गैंट)", "Compact": "छोटा", "Normal": "सामान्य", "Wide": "चौड़ा", "Completed / ahead": "पूर्ण / आगे", "On track": "समय पर", "Preparing…": "तैयार हो रहा है…", "Preparing report…": "रिपोर्ट तैयार हो रही है…", "Light bar = planned dates · solid fill = actual progress · vertical tick = where progress should be today": "हल्की पट्टी = नियोजित तारीखें · भरा हिस्सा = वास्तविक प्रगति · खड़ी रेखा = आज प्रगति कहाँ होनी चाहिए", "Chart motion: on (click to turn off)": "चार्ट गति: चालू (बंद करने के लिए क्लिक करें)", "Chart motion: off (click to turn on)": "चार्ट गति: बंद (चालू करने के लिए क्लिक करें)", "Excel report ": "Excel रिपोर्ट", "Planned vs Actual": "योजना बनाम वास्तविक", "You’re offline. Entries are still saved in this browser; cloud sync resumes when you’re back online.": "आप ऑफ़लाइन हैं। प्रविष्टियाँ इसी ब्राउज़र में सहेजी रहेंगी; ऑनलाइन आते ही क्लाउड सिंक फिर शुरू होगा।", "Daily report reminder": "दैनिक रिपोर्ट रिमाइंडर", "Remind me": "मुझे याद दिलाएँ", "Remind me at": "इस समय याद दिलाएँ", "Allow notifications": "सूचनाओं की अनुमति दें", "Send test": "टेस्ट भेजें", "Notifications are on.": "सूचनाएँ चालू हैं।", "Notifications are blocked in this browser. Allow them in the site settings.": "इस ब्राउज़र में सूचनाएँ बंद हैं। साइट सेटिंग्स में अनुमति दें।", "Notifications are not supported here. You will still see the reminder inside the app.": "यहाँ सूचनाएँ समर्थित नहीं हैं। रिमाइंडर ऐप के अंदर फिर भी दिखेगा।", "Test notification sent.": "टेस्ट सूचना भेजी गई।", "Add report": "रिपोर्ट जोड़ें", "Later": "बाद में", "Daily report pending": "दैनिक रिपोर्ट बाकी है", "Language": "भाषा", "Works while InfraTrack is open in a browser tab or installed as an app. Alerts when the app is fully closed need a push server, which isn't set up.": "यह तब काम करता है जब InfraTrack ब्राउज़र टैब या इंस्टॉल किए ऐप में खुला हो। ऐप पूरी तरह बंद होने पर अलर्ट के लिए पुश सर्वर चाहिए, जो अभी सेट नहीं है।"};
const HI_MONTHS = { Jan: "जन", Feb: "फ़र", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुल", Aug: "अग", Sep: "सित", Sept: "सित", Oct: "अक्तू", Nov: "नव", Dec: "दिस" };
const I18N_RX = [
  [/Good morning/g, "सुप्रभात"], [/Good afternoon/g, "नमस्कार"], [/Good evening/g, "शुभ संध्या"], [/Good night/g, "शुभ रात्रि"],
  [/(\d+)\s*d late/g, "$1 दिन देरी"], [/(\d+)\s*d behind/g, "$1 दिन पीछे"], [/(\d+) days? behind/g, "$1 दिन पीछे"], [/(\d+) days? ahead/g, "$1 दिन आगे"],
  [/(\d+) projects? behind schedule/g, "$1 प्रोजेक्ट शेड्यूल से पीछे"], [/(\d+) critical/g, "$1 गंभीर"],
  [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec) (\d{2})$/, (m, mo, yy) => `${HI_MONTHS[mo]} ${yy}`],
];
const I18N_KEY = "bs-lang", I18N_ATTRS = ["placeholder", "title", "aria-label"];
const I18N_OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS };
let _i18nObs = null;
function i18nLang() { try { return localStorage.getItem(I18N_KEY) === "hi" ? "hi" : "en"; } catch (e) { return "en"; } }
function trHi(v) {
  const t = v.trim();
  if (t.length < 2) return v;
  const hit = I18N_HI[t] || I18N_EXACT[t] || I18N_EXACT2[t] || I18N_PAIR_EXACT[t];
  if (hit) return v.replace(t, () => hit);
  // "a   •   b   •   c" ticker lines: translate each part on its own
  if (/\s•\s/.test(t)) return v.replace(t, () => t.split(/(\s+•\s+)/).map((x, i) => (i % 2 ? x : trHi(x))).join(""));
  let out = v;
  const tpl = tplHi(t);
  if (tpl !== null) out = v.replace(t, () => tpl);
  for (const [rx, to] of I18N_RX_FIRST) out = out.replace(rx, to);
  for (const [rx, to] of I18N_RX) out = out.replace(rx, to);
  for (const [rx, to] of I18N_RX_EXTRA) out = out.replace(rx, to);
  return out;
}
setTrHi(trHi);
function i18nNode(n) {
  const v = n.nodeValue;
  if (n.__hi !== undefined && v === n.__hi) return;
  const out = trHi(v);
  if (out !== v) { n.__en = v; n.__hi = out; n.nodeValue = out; } else n.__hi = undefined;
}
function i18nEl(el) {
  I18N_ATTRS.forEach((a) => {
    const v = el.getAttribute(a);
    if (v === null) return;
    el.__hiA = el.__hiA || {};
    if (el.__hiA[a] === v) return;
    const o = trHi(v);
    if (o !== v) { el.__enA = el.__enA || {}; el.__enA[a] = v; el.__hiA[a] = o; el.setAttribute(a, o); }
  });
}
function i18nTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { i18nNode(root); return; }
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(root.tagName)) return;
  i18nEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { const p = n.parentNode; if (p && /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)) continue; i18nNode(n); } else i18nEl(n);
  }
}
function i18nRevert() {
  const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { if (n.__hi !== undefined && n.nodeValue === n.__hi) n.nodeValue = n.__en; n.__hi = undefined; }
    else if (n.__enA) { Object.keys(n.__enA).forEach((a) => { if (n.getAttribute(a) === n.__hiA[a]) n.setAttribute(a, n.__enA[a]); }); n.__enA = null; n.__hiA = null; }
  }
}
function i18nStart() {
  if (_i18nObs || typeof MutationObserver === "undefined") return;
  document.documentElement.lang = "hi";
  if (!document.getElementById("bs-hi-font")) { const l = document.createElement("link"); l.id = "bs-hi-font"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700;800&display=swap"; document.head.appendChild(l); }
  let queue = [], raf = 0;
  const flush = () => { raf = 0; const q = queue; queue = []; _i18nObs.disconnect(); q.forEach(i18nTree); _i18nObs.observe(document.body, I18N_OPTS); };
  _i18nObs = new MutationObserver((ms) => {
    ms.forEach((m) => { if (m.type === "childList") m.addedNodes.forEach((x) => queue.push(x)); else queue.push(m.target); });
    if (!raf) raf = requestAnimationFrame(flush);
  });
  i18nTree(document.body);
  _i18nObs.observe(document.body, I18N_OPTS);
}
function i18nStop() { if (_i18nObs) { _i18nObs.disconnect(); _i18nObs = null; } document.documentElement.lang = "en"; i18nRevert(); }
function i18nSet(l) { try { localStorage.setItem(I18N_KEY, l); } catch (e) {} if (l === "hi") i18nStart(); else i18nStop(); }
if (typeof document !== "undefined" && i18nLang() === "hi") { if (document.body) i18nStart(); else document.addEventListener("DOMContentLoaded", i18nStart); }
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < 820);
  useEffect(() => { const f = () => setM(window.innerWidth < 820); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return m;
}
function LoopRC(props) {
  return <ResponsiveContainer {...props} />;
}

function ProgressBar({ theme, value, color, height = 7, track }) {
  return (
    <div style={{ width: "100%", height, borderRadius: 999, background: track || theme.panelAlt, overflow: "hidden" }}>
      <div style={{
        width: `${clamp(value, 0, 100)}%`, height: "100%", backgroundColor: color || theme.blue, borderRadius: 999,
        }} />
    </div>
  );
}

function Gauge({ theme, value, size = 168, label, sub, color }) {
  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;
  const animated = useCountUp(value, 1100);
  const off = c - (clamp(animated, 0, 100) / 100) * c;
  const col = color || (value >= 75 ? theme.green : value >= 55 ? theme.warn : theme.red);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={theme.panelAlt} strokeWidth={12} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="bs-gauge-arc" stroke={col} strokeWidth={12} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: size * 0.2, fontWeight: 700, color: theme.text }}>{Math.round(animated)}</div>
        {label && <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textMuted, fontWeight: 700, marginTop: -2 }}>{label}</div>}
        {sub && <div style={{ fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function IconBtn({ theme, icon: Icon, onClick, active, title }) {
  return (
    <button title={title} onClick={onClick} className="bs-btn bs-icon-btn" style={{
      width: 34, height: 34, borderRadius: 3, display: "grid", placeItems: "center", cursor: "pointer",
      background: active ? theme.panelAlt : "transparent", border: `1px solid ${active ? theme.border : "transparent"}`,
      color: theme.textMuted,
    }}>
      <Icon size={16} />
    </button>
  );
}

function Button({ theme, children, onClick, kind = "primary", icon: Icon, style, small, className, disabled }) {
  const styles = {
    primary: { background: theme.accent, color: theme.onAccent, border: `1px solid ${theme.accent}` },
    ghost: { background: "transparent", color: theme.text, border: `1px solid ${theme.border}` },
    subtle: { background: theme.panelAlt, color: theme.text, border: `1px solid ${theme.border}` },
    danger: { background: theme.redSoft, color: theme.red, border: `1px solid ${theme.red}55` },
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`bs-btn${className ? " " + className : ""}`} style={{
      ...styles[kind], ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : null), fontFamily: FONT_UI, fontWeight: 600, fontSize: small ? 12 : 12.5, letterSpacing: "0.04em", borderRadius: 2,
      padding: small ? "6px 10px" : "9px 14px", display: "inline-flex", alignItems: "center", gap: 7, cursor: disabled ? "not-allowed" : "pointer",
      whiteSpace: "nowrap", ...style,
    }}>
      {Icon && <Icon size={small ? 13 : 14} />}
      {children}
    </button>
  );
}

function Modal({ theme, title, onClose, children, width = 560 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000aa", zIndex: 90, display: "grid", placeItems: "center",
      }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width, maxWidth: "92vw", maxHeight: "86vh", overflow: "auto", background: theme.panel,
        border: `1px solid ${theme.border}`, borderRadius: 3, padding: 22,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.text }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ theme, toasts }) {
  return (
    <div className="no-print" style={{ position: "fixed", bottom: 76, right: 12, left: 12, maxWidth: 440, marginLeft: "auto", zIndex: 200, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "11px 15px",
          display: "flex", alignItems: "center", gap: 9, boxShadow: "0 8px 24px #00000030", pointerEvents: "auto",
          }}>
          <CircleCheck size={16} color={theme.green} />
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, fontWeight: 600 }}>{t.msg}</div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   NAV / SHELL
   ========================================================================= */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "overview", label: "Project Overview", icon: FolderKanban },
  { id: "dataentry", label: "Data Entry", icon: ClipboardList },
  { id: "planactual", label: "Plan vs Actual (Daily)", icon: GitCompareArrows },
  { id: "activities", label: "Activities", icon: ListChecks },
  { id: "gantt", label: "Timeline (Gantt)", icon: CalendarDays },
  { id: "cost", label: "Cost & Budget", icon: Wallet },
  { id: "safety", label: "Safety & Site Log", icon: HardHat },
  { id: "siteactivity", label: "Site Activity", icon: Video },
  { id: "delays", label: "Delay Detection", icon: AlertTriangle },
  { id: "contractors", label: "Contractor Performance", icon: Users },
  { id: "resources", label: "Resource Analytics", icon: Boxes },
  { id: "forecast", label: "Predictive Completion", icon: TrendingUp },
  { id: "dpr", label: "Daily Progress Report", icon: FileText },
  { id: "report", label: "Project Report (PDF/Excel)", icon: Download },
  { id: "audit", label: "Audit Trail", icon: Shield },
  { id: "backup", label: "Backup & Cloud", icon: Download },
  { id: "about", label: "About", icon: Info },
];

function Sidebar({ theme: _pageTheme, view, setView, collapsed, setCollapsed }) {
  const theme = NAV_THEME;
  const activeIndex = NAV.findIndex(n => n.id === view);
  const ROW_H = 38;
  const NAV_TOP = 10;
  const MAG_RADIUS = 62;
  const MAG_SCALE = 1.1;
  const MAG_SHIFT = 7;
  const [hoverY, setHoverY] = useState(null);
  const navRef = useRef(null);

  const handleNavMove = (e) => {
    const rect = navRef.current.getBoundingClientRect();
    setHoverY(e.clientY - rect.top + navRef.current.scrollTop);
  };
  const handleNavLeave = () => setHoverY(null);

  const magnify = (index) => {
    if (hoverY == null) return { scale: 1, shift: 0 };
    const center = NAV_TOP + index * ROW_H + (ROW_H - 2) / 2;
    const d = Math.abs(hoverY - center);
    const t = Math.max(0, 1 - d / MAG_RADIUS);
    const eased = t * t;
    return { scale: 1 + eased * (MAG_SCALE - 1), shift: eased * MAG_SHIFT };
  };

  return (
    <div className="no-print" style={{
      width: collapsed ? 64 : 246, flexShrink: 0, background: theme.bgElevated, borderRight: `1px solid ${theme.border}`,
      display: "flex", flexDirection: "column", height: "100vh",
      position: "sticky", top: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 16px", borderBottom: `1px solid ${theme.borderSoft}`, position: "relative", zIndex: 1 }}>
        <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
          <InfraTrackLogo size={30} bg={theme.accent} />
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 14.5, color: theme.text, whiteSpace: "nowrap" }}>InfraTrack</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 10.5, color: theme.textFaint, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
              <span className="bs-livedot" style={{ width: 5, height: 5 }} /> Connecting Plans to Reality
            </div>
          </div>
        )}
      </div>
      <div ref={navRef} onMouseMove={handleNavMove} onMouseLeave={handleNavLeave}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px 8px", position: "relative", zIndex: 1 }}>
        <div style={{
          position: "absolute", left: 8, right: 8, top: NAV_TOP + activeIndex * ROW_H, height: ROW_H - 2, borderRadius: 3,
          background: theme.panelAlt, border: `1px solid ${hexAlpha(theme.accent, 0.28)}`,
          pointerEvents: "none", zIndex: 0,
          boxShadow: `0 0 14px ${hexAlpha(theme.accent, 0.1)}`,
        }} />
        {NAV.map((n, i) => {
          const active = view === n.id;
          const { scale, shift } = magnify(i);
          return (
            <button key={n.id} onClick={() => setView(n.id)} title={n.label} className="bs-nav-item" style={{
              width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", marginBottom: 2, height: ROW_H - 2,
              borderRadius: 3, border: "none", cursor: "pointer", textAlign: "left", position: "relative", zIndex: 1,
              background: "transparent",
              color: active ? theme.text : theme.textMuted,
                          }}>
              <n.icon size={16} className="bs-nav-icon" style={{ flexShrink: 0, color: active ? theme.accent : theme.textFaint }} />
              {!collapsed && <span style={{ fontFamily: FONT_UI, fontSize: 13, fontWeight: active ? 700 : 600, whiteSpace: "nowrap" }}>{n.label}</span>}
              {active && !collapsed && <span className="bs-livedot" style={{ marginLeft: "auto" }} />}
            </button>
          );
        })}
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${theme.borderSoft}`, position: "relative", zIndex: 1 }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: theme.textFaint, letterSpacing: 0.3 }}>PLAN vs ACTUAL</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="bs-nav-item" style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 8,
          padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: theme.textFaint,
          fontFamily: FONT_UI, fontSize: 12, marginLeft: -4,
        }}>
          <span style={{ display: "inline-flex", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronLeft size={15} />
          </span>
          {!collapsed && "Collapse"}
        </button>
      </div>
          </div>
  );
}

function NotificationsDrawer({ theme, notifications, onClose, onMarkRead }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 95 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "#00000060" }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: 380, background: theme.panel,
        borderLeft: `1px solid ${theme.border}`, padding: 18, overflowY: "auto",
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: theme.text }}>Notifications</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}><X size={17} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifications.map(n => (
            <button key={n.id} onClick={() => onMarkRead(n.id)} className="bs-card-interactive" style={{
              textAlign: "left", border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: 12,
              background: n.read ? "transparent" : theme.panelAlt,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <StatusBadge status={n.cat} theme={theme} />
                {!n.read && <span style={{ width: 7, height: 7, borderRadius: 999, background: theme.accent, marginTop: 3 }} />}
              </div>
              <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, lineHeight: 1.4 }}>{n.text}</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, marginTop: 5 }}>{n.time}</div>
            </button>
          ))}
          {notifications.length === 0 && <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, padding: 12 }}>No notifications yet. New high or critical alerts from your data appear here.</div>}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   TOPBAR
   ========================================================================= */
function ProfileMenu({ theme, userName, role }) {
  const [open, setOpen] = useState(false);
  const [teamCode, setTeamCode] = useState(() => genTeamCode());
  const [codeInput, setCodeInput] = useState("");
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const teammates = [];

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(teamCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const handleJoin = () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter the full team code."); return; }
    setJoinError("");
    setTeamCode(code);
    setJoined(true);
    setCodeInput("");
  };
  const handleLeave = () => {
    setJoined(false);
    setTeamCode(genTeamCode());
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} title="Profile" style={{
        display: "flex", alignItems: "center", gap: 7, background: open ? theme.panelAlt : "transparent",
        border: `1px solid ${theme.border}`, borderRadius: 3, padding: "5px 9px 5px 5px", cursor: "pointer",
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%", background: theme.accent, color: theme.onAccent,
          display: "grid", placeItems: "center", fontFamily: FONT_UI, fontWeight: 800, fontSize: 10.5, flexShrink: 0,
        }}>
          {initials(userName)}
        </div>
        <ChevronDown size={12} color={theme.textFaint} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 46, right: 0, width: 300, background: theme.panel, border: `1px solid ${theme.border}`,
          borderRadius: 3, zIndex: 40, boxShadow: "0 16px 40px #00000038", overflow: "hidden",
        }}>
          <div style={{ padding: "16px 16px 14px", borderBottom: `1px solid ${theme.borderSoft}`, display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: theme.accent, color: theme.onAccent,
              display: "grid", placeItems: "center", fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, flexShrink: 0,
            }}>
              {initials(userName)}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {userName || "Guest User"}
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3, padding: "1.5px 7px", borderRadius: 999, background: theme.accentSoft, border: `1px solid ${hexAlpha(theme.accent, 0.3)}` }}>
                <ShieldCheck size={10} color={theme.accent} />
                <span style={{ fontFamily: FONT_UI, fontSize: 10.5, fontWeight: 700, color: theme.accent }}>{role}</span>
              </div>
            </div>
          </div>

          <div style={{ padding: "14px 16px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Users size={13} color={theme.textFaint} />
              <span style={{ fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {joined ? "Your team" : "Team code"}
              </span>
            </div>

            {!joined ? (
              <>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "9px 10px", borderRadius: 3, background: theme.panelAlt, border: `1px solid ${theme.border}`, marginBottom: 8,
                }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: theme.text, letterSpacing: 2 }}>{teamCode}</span>
                  <button onClick={handleCopy} style={{
                    display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
                    color: copied ? theme.green : theme.accent, fontFamily: FONT_UI, fontSize: 11, fontWeight: 700,
                  }}>
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: theme.textFaint, margin: "0 0 12px", lineHeight: 1.5 }}>
                  Share this code — anyone who enters it joins your team.
                </p>

                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={codeInput} onChange={e => { setCodeInput(e.target.value); setJoinError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
                    placeholder="Have a code? Enter it"
                    style={{
                      flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 3, background: theme.bg,
                      border: `1px solid ${joinError ? theme.red : theme.border}`, color: theme.text,
                      fontFamily: FONT_MONO, fontSize: 12.5, outline: "none", textTransform: "uppercase",
                    }}
                  />
                  <button onClick={handleJoin} style={{
                    padding: "8px 12px", borderRadius: 3, border: "none", cursor: "pointer",
                    background: theme.accent, color: theme.onAccent, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                  }}>
                    Join
                  </button>
                </div>
                {joinError && <p style={{ fontSize: 10.5, color: theme.red, margin: "6px 0 0" }}>{joinError}</p>}
              </>
            ) : (
              <>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "8px 10px", borderRadius: 3, background: theme.accentSoft, border: `1px solid ${hexAlpha(theme.accent, 0.3)}`, marginBottom: 10,
                }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: theme.accent, letterSpacing: 1.5 }}>{teamCode}</span>
                  <button onClick={handleLeave} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textFaint, fontFamily: FONT_UI, fontSize: 10.5, fontWeight: 700 }}>
                    Leave
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: theme.accent, color: theme.onAccent, display: "grid", placeItems: "center", fontFamily: FONT_UI, fontWeight: 800, fontSize: 9.5, flexShrink: 0 }}>
                      {initials(userName)}
                    </div>
                    <span style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: theme.text }}>{userName || "You"}</span>
                    <span style={{ marginLeft: "auto", fontFamily: FONT_UI, fontSize: 10, color: theme.textFaint }}>{role}</span>
                  </div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 10.5, color: theme.textFaint, padding: "4px 2px", lineHeight: 1.45 }}>Team sync isn't connected to a server, so other members can't appear here yet.</div>
                  {teammates.map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 2px" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: theme.panelAlt, border: `1px solid ${theme.border}`, color: theme.textMuted, display: "grid", placeItems: "center", fontFamily: FONT_UI, fontWeight: 800, fontSize: 9.5, flexShrink: 0 }}>
                        {initials(m.name)}
                      </div>
                      <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.text }}>{m.name}</span>
                      <span style={{ marginLeft: "auto", fontFamily: FONT_UI, fontSize: 10, color: theme.textFaint }}>{m.role}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Topbar({ theme: _pageTheme, dark, setDark, projects, project, setProject, onAddProject, onLoadDemo, onLoadAyodhya, onLoadSultanganj, onDeleteProject, role, setRole, onSearch, onBell, unread, userName, onLogout, summary, setView, sync }) {
  const theme = NAV_THEME;
  const [projOpen, setProjOpen] = useState(false);
  const roles = ["Project Manager", "Admin", "Site Engineer", "Planning Engineer", "Contractor", "Client / Owner", "Executive"];
  const mobile = useIsMobile();
  const now = useClock();
  const { text: greetText, Icon: GreetIcon } = greeting(now.getHours());
  return (
    <div className="no-print" style={mobile ? {
      minHeight: 58, borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
      padding: "8px 12px", background: theme.bg, position: "relative", zIndex: 20,
    } : {
      height: 58, borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 12,
      padding: "0 18px", background: theme.bg, position: "sticky", top: 0, zIndex: 20,
    }}>
      {userName && !mobile && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 3,
          background: theme.accentSoft, border: `1px solid ${hexAlpha(theme.accent, 0.3)}`, flexShrink: 0,
        }}>
          <GreetIcon size={12} color={theme.accent} />
          <span style={{ fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 700, color: theme.accent, whiteSpace: "nowrap" }}>
            {greetText}, {userName.split(" ")[0]}
          </span>
        </div>
      )}
      <div style={mobile ? { position: "relative", flex: "1 1 0", minWidth: 0 } : { position: "relative" }}>
        <button onClick={() => setProjOpen(!projOpen)} style={{
          display: "flex", alignItems: "center", gap: 8, background: theme.panel, border: `1px solid ${theme.border}`,
          borderRadius: 3, padding: "7px 11px", cursor: "pointer", maxWidth: mobile ? "100%" : 300, width: mobile ? "100%" : undefined, minWidth: 0,
        }}>
          <Building2 size={14} color={theme.textFaint} />
          <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project ? project.name : "No project yet"}
          </span>
          <ChevronDown size={13} color={theme.textFaint} />
        </button>
        {projOpen && (
          <div style={{
            position: "absolute", top: 42, left: 0, background: theme.panel, border: `1px solid ${theme.border}`,
            borderRadius: 3, width: mobile ? "calc(100vw - 24px)" : 320, maxWidth: 320, zIndex: 30, boxShadow: "0 12px 30px #00000030", overflow: "hidden",
          }}>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {projects.map(p => (
                <div key={p.id} className="bs-row" onClick={() => { setProject(p); setProjOpen(false); }} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 13px",
                  background: project && p.id === project.id ? theme.panelAlt : "transparent",
                  borderBottom: `1px solid ${theme.borderSoft}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.client} · {p.value}</div>
                  </div>
                  <button
                    title="Delete project"
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                    className="bs-icon-btn"
                    style={{
                      flexShrink: 0, width: 26, height: 26, borderRadius: 3, border: `1px solid ${theme.border}`,
                      background: "transparent", cursor: "pointer", display: "grid", placeItems: "center",
                    }}
                  >
                    <X size={13} color={theme.red} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => { setProjOpen(false); onAddProject(); }} className="bs-btn" style={{
              width: "100%", textAlign: "left", padding: "11px 13px", background: theme.accentSoft,
              border: "none", borderTop: `1px solid ${theme.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Plus size={14} color={theme.accent} />
              <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.accent }}>Add New Project</span>
            </button>
            <button onClick={() => { setProjOpen(false); onLoadDemo && onLoadDemo(); }} className="bs-btn" style={{
              width: "100%", textAlign: "left", padding: "11px 13px", background: "transparent",
              border: "none", borderTop: `1px solid ${theme.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Sparkles size={14} color={theme.accent} />
              <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text }}>Load Demo Project (all entries filled)</span>
            </button>
            {onLoadAyodhya && <button onClick={() => { setProjOpen(false); onLoadAyodhya(); }} className="bs-btn" style={{
              width: "100%", textAlign: "left", padding: "11px 13px", background: "transparent",
              border: "none", borderTop: `1px solid ${theme.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Sparkles size={14} color={theme.accent} />
              <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text }}>Load Demo: Northern Ayodhya Bypass (NHAI)</span>
            </button>}
            {onLoadSultanganj && <button onClick={() => { setProjOpen(false); onLoadSultanganj(); }} className="bs-btn" style={{
              width: "100%", textAlign: "left", padding: "11px 13px", background: "transparent",
              border: "none", borderTop: `1px solid ${theme.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Sparkles size={14} color={theme.accent} />
              <span style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text }}>Load Demo: Aguwani–Sultanganj Ganga Bridge</span>
            </button>}
          </div>
        )}
      </div>

      {mobile && <IconBtn theme={theme} icon={Search} onClick={onSearch} title="Search" />}
      {!mobile && <button onClick={onSearch} style={{
        flex: 1, maxWidth: 420, display: "flex", alignItems: "center", gap: 8, background: theme.panel,
        border: `1px solid ${theme.border}`, borderRadius: 3, padding: "7px 11px", cursor: "pointer", color: theme.textFaint,
      }}>
        <Search size={14} />
        <span style={{ fontFamily: FONT_UI, fontSize: 12.5 }}>Search pages, activities, contractors…</span>
        <span style={{
          marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 10.5, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "1px 6px",
        }}>⌘K</span>
      </button>}

      {(() => {
        const bell = (
          <div style={{ position: "relative" }}>
            <IconBtn theme={theme} icon={Bell} onClick={onBell} title="Notifications" />
            {unread > 0 && (
              <span style={{
                position: "absolute", top: 3, right: 3, width: 15, height: 15, borderRadius: 999, background: theme.red,
                color: "#fff", fontFamily: FONT_MONO, fontSize: 9, display: "grid", placeItems: "center", fontWeight: 700,
              }}>{unread}</span>
            )}
          </div>);
        const logoutBtn = <IconBtn theme={theme} icon={LogOut} onClick={onLogout} title="Log out" />;
        const tools = (
          <>
            <LangToggle theme={theme} />
            <ReminderMenu theme={theme} />
            <InstallButton theme={theme} />
            <IconBtn theme={theme} icon={dark ? Sun : Moon} onClick={() => setDark(!dark)} title="Toggle theme" />
            <ProfileMenu theme={theme} userName={userName} role={role} />
          </>);
        if (mobile) {
          return (
            <>
              {bell}{logoutBtn}
              <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                {sync && <SyncPill theme={theme} sync={sync} />}
                <ProjectRiskAlert theme={theme} summary={summary} setView={setView} />
                {tools}
              </div>
            </>);
        }
        return (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {sync && <SyncPill theme={theme} sync={sync} />}
            <ProjectRiskAlert theme={theme} summary={summary} setView={setView} />
            {bell}{tools}{logoutBtn}
          </div>);
      })()}
    </div>
  );
}

function DashboardHero({ theme, project, tickerItems, userName }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const { text: greetText } = greeting(now.getHours());
  const tickerText = tickerItems.join("   •   ");
  return (
    <div style={{ position: "relative", borderRadius: 3, overflow: "hidden", border: `1px solid ${theme.border}`, marginBottom: 20, background: theme.panel }}>
      <div style={{ position: "relative", padding: "22px 24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span className="bs-livedot" />
              <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, color: theme.accent, letterSpacing: 0.3 }}>LIVE PROJECT FEED</span>
            </div>
            <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.text }}>{greetText}, {(userName || "Guest").split(" ")[0]}</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: theme.textMuted, marginTop: 3 }}>Here's what needs your attention today on {project.name}.</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: theme.text, letterSpacing: -0.5 }}>{clockStr}</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, marginTop: 2 }}>Site local time</div>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 11, borderTop: `1px solid ${theme.borderSoft}`, overflow: "hidden", whiteSpace: "nowrap" }}>
          <div className="bs-marquee" style={{ display: "inline-block" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, paddingRight: 40 }}>{tickerText}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, paddingRight: 40 }}>{tickerText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   GENERIC PAGE HERO
   Every page (not just Dashboard) opens on this same motion backdrop —
   the animated node/pulse canvas plus an optional live ticker — so the
   whole app feels like one continuously-alive system rather than a stack
   of static screens. `right` slots in page-specific controls (filters,
   primary actions) so each page still reads as its own workspace.
   ========================================================================= */
function PageHero({ theme, icon: Icon, eyebrow = "LIVE", title, subtitle, tickerItems, right, compact }) {
  const tickerText = tickerItems && tickerItems.length ? tickerItems.join("   •   ") : null;
  return (
    <div style={{ position: "relative", borderRadius: 3, overflow: "hidden", border: `1px solid ${theme.border}`, marginBottom: 20, background: theme.panel }}>
      <div style={{ position: "relative", padding: compact ? "16px 22px" : "20px 24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span className="bs-livedot" />
              <span style={{ fontFamily: FONT_UI, fontSize: 11, fontWeight: 800, color: theme.accent, letterSpacing: 0.3 }}>{eyebrow}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {Icon && (
                <div style={{ width: 34, height: 34, borderRadius: 3, background: theme.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon size={17} color={theme.accent} />
                </div>
              )}
              <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.text }}>{title}</div>
            </div>
            {subtitle && <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, marginTop: 4, marginLeft: Icon ? 44 : 0 }}>{subtitle}</div>}
          </div>
          {right && <div>{right}</div>}
        </div>
        {tickerText && (
          <div style={{ marginTop: 16, paddingTop: 11, borderTop: `1px solid ${theme.borderSoft}`, overflow: "hidden", whiteSpace: "nowrap" }}>
            <div className="bs-marquee" style={{ display: "inline-block" }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, paddingRight: 40 }}>{tickerText}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, paddingRight: 40 }}>{tickerText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveWeatherCard({ theme }) {
  const [status, setStatus] = useState("locating"); // locating | loading | ready | error | unsupported
  const [errorMsg, setErrorMsg] = useState("");
  const [place, setPlace] = useState("");
  const [weather, setWeather] = useState(null);

  const fetchWeather = (lat, lon) => {
    setStatus("loading");
    Promise.allSettled([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`).then(r => r.json()),
      fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`).then(r => r.json()),
    ]).then(([wRes, pRes]) => {
      if (wRes.status !== "fulfilled" || !wRes.value?.current_weather) {
        setStatus("error"); setErrorMsg("Couldn't fetch weather right now."); return;
      }
      setWeather(wRes.value.current_weather);
      if (pRes.status === "fulfilled" && pRes.value && !pRes.value.error) {
        const p = pRes.value;
        setPlace([p.locality, p.principalSubdivision].filter(Boolean).join(", ") || p.countryName || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`);
      } else {
        setPlace(`${lat.toFixed(2)}°, ${lon.toFixed(2)}°`);
      }
      setStatus("ready");
    }).catch(() => { setStatus("error"); setErrorMsg("Couldn't fetch weather right now."); });
  };

  const locate = () => {
    if (!("geolocation" in navigator)) { setStatus("unsupported"); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      err => {
        setStatus("error");
        setErrorMsg(err.code === 1 ? "Location access denied — enable it to see local weather delay risk." : "Couldn't get your location.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  };

  useEffect(() => { locate(); }, []);

  const info = weather ? weatherInfo(weather.weathercode, weather.windspeed) : null;
  const delay = info ? DELAY_BY_RISK[info.risk] : null;
  const riskColor = !delay ? theme.textFaint : info.risk === "low" ? theme.green : info.risk === "moderate" ? theme.warn : theme.red;

  return (
    <Card theme={theme}>
      <style>{`@keyframes bsWeatherSpin { to { transform: rotate(360deg); } }`}</style>
      <SectionTitle theme={theme} title="Live Site Weather & Delay Risk"
        sub={status === "ready" ? `${place} · updated just now` : "Using your device's live location"}
        right={<Button theme={theme} kind="ghost" small icon={RefreshCw} onClick={locate}>Refresh</Button>} />

      {(status === "locating" || status === "loading") && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 4px", color: theme.textMuted, fontFamily: FONT_UI, fontSize: 13 }}>
          <span className="bs-spin" style={{
            width: 16, height: 16, border: `2px solid ${theme.border}`, borderTopColor: theme.accent,
            borderRadius: "50%", animation: "bsWeatherSpin 700ms linear infinite", display: "inline-block", flexShrink: 0,
          }} />
          {status === "locating" ? "Getting your live location…" : "Fetching current weather…"}
        </div>
      )}

      {(status === "error" || status === "unsupported") && (
        <div style={{ padding: "10px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.textMuted, fontFamily: FONT_UI, fontSize: 13 }}>
            <CloudFog size={16} color={theme.textFaint} />
            {status === "unsupported" ? "Geolocation isn't supported in this browser." : (errorMsg || "Couldn't get your location.")}
          </div>
          <Button theme={theme} kind="subtle" small icon={Navigation} onClick={locate} style={{ alignSelf: "flex-start" }}>Try again</Button>
        </div>
      )}

      {status === "ready" && info && (
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 3, background: theme.panelAlt, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <info.Icon size={26} color={theme.accent} />
            </div>
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, color: theme.text, lineHeight: 1 }}>{Math.round(weather.temperature)}°C</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginTop: 3 }}>{info.label} · {Math.round(weather.windspeed)} km/h wind</div>
            </div>
          </div>

          <div style={{ width: 1, alignSelf: "stretch", background: theme.borderSoft }} />

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{
                padding: "3px 9px", borderRadius: 999, fontFamily: FONT_UI, fontSize: 11, fontWeight: 700,
                background: hexAlpha(riskColor, 0.14), color: riskColor, textTransform: "capitalize",
              }}>{info.risk} delay risk</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textFaint }}>{delay.days}</span>
            </div>
            <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5, margin: 0 }}>{delay.text}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

/* =========================================================================
   DAILY PROGRESS REPORT
   ========================================================================= */
/* =========================================================================
   REAL FILE EXPORT HELPERS — actual downloadable PDF/CSV files, not simulated
   ========================================================================= */
let _jsPdfLoadPromise = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jsPdfLoadPromise) return _jsPdfLoadPromise;
  _jsPdfLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jspdf="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jspdf.jsPDF));
      existing.addEventListener("error", () => reject(new Error("PDF engine failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.dataset.jspdf = "1";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = () => reject(new Error("Could not reach the PDF engine — check your connection and try again."));
    document.head.appendChild(script);
  });
  return _jsPdfLoadPromise;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  // Sandboxed preview iframes often silently block a script-triggered anchor "download" —
  // opening the blob in a new tab is far more reliable; the browser's own viewer/download
  // button then does the actual save. Anchor-click is kept only as a last-resort fallback.
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* =========================================================================
   PLANNED vs ACTUAL TRACKER
   Every number on this page comes from what the user typed in (plan at
   project creation, actuals from the daily entry form). Nothing is
   auto-generated, simulated or pre-filled.
   ========================================================================= */
const TRACKER_KEY = "infratrack-plan-actual-v1";
const CUSTOM_PROJECTS_KEY = "infratrack-custom-projects-v1";
const DELAY_REASONS = [
  "Weather", "Material shortage", "Labour shortage", "Machine breakdown",
  "Design / drawing change", "Client / approval hold", "Land / site access", "Other",
];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_DAY = 86400000;

/* ---- persistence: window.storage when available, localStorage as fallback ---- */
async function storeGet(key) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const res = await window.storage.get(key, false);
      return res && res.value ? JSON.parse(res.value) : null;
    }
  } catch (e) { /* key missing or storage unavailable */ }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
async function storeSet(key, value) {
  const json = JSON.stringify(value);
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.set(key, json, false);
      return !!r;
    }
  } catch (e) { return false; }
  try { window.localStorage.setItem(key, json); return true; } catch (e) { return false; }
}

/* ---- date helpers (UTC based, ISO yyyy-mm-dd strings) ---- */
function toDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function toISO(dt) { return dt.toISOString().slice(0, 10); }
function addDays(iso, n) { return toISO(new Date(toDate(iso).getTime() + n * MS_DAY)); }
function diffDays(a, b) { return Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY); }
function isValidISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(toDate(s).getTime()); }
function fmtDMY(iso) {
  if (!iso || !isValidISO(iso)) return "—";
  const dt = toDate(iso);
  return `${String(dt.getUTCDate()).padStart(2, "0")} ${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}
function fmtShort(iso) {
  if (!iso || !isValidISO(iso)) return "";
  const dt = toDate(iso);
  return `${dt.getUTCDate()} ${MONTH_NAMES[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`;
}
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) { const [y, m] = key.split("-").map(Number); return `${MONTH_NAMES[m - 1]} ${y}`; }
function isWorkingDay(iso, perWeek) {
  const dow = toDate(iso).getUTCDay();
  if (perWeek >= 7) return true;
  if (perWeek === 6) return dow !== 0;
  return dow !== 0 && dow !== 6;
}
function monthsInRange(startISO, endISO) {
  const keys = [];
  const s = toDate(startISO);
  let cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  const end = toDate(endISO);
  while (cur <= end) {
    keys.push(toISO(cur).slice(0, 7));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return keys;
}
function workingDaysInMonthWithinPlan(key, startISO, endISO, perWeek) {
  const [y, m] = key.split("-").map(Number);
  const first = toISO(new Date(Date.UTC(y, m - 1, 1)));
  const last = toISO(new Date(Date.UTC(y, m, 0)));
  const from = first < startISO ? startISO : first;
  const to = last > endISO ? endISO : last;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, perWeek)) n++;
  return n;
}
function countWorkingDays(fromISO, toISOStr, perWeek) {
  let n = 0;
  for (let d = fromISO; d <= toISOStr; d = addDays(d, 1)) if (isWorkingDay(d, perWeek)) n++;
  return n;
}
const round1 = (v) => Math.round(v * 10) / 10;

/* ---- plan validation: turns the typed form into a saved plan object ---- */
function resolvePlan(d) {
  if (!isValidISO(d.startDate) || !isValidISO(d.endDate)) return { error: "Start Date and Planned Completion Date are both required for the plan." };
  if (d.endDate <= d.startDate) return { error: "Planned Completion Date must be after the Start Date." };
  const workers = Number(d.workers), machines = Number(d.machines);
  if (d.workers === "" || !Number.isInteger(workers) || workers <= 0) return { error: "Planned workers per day must be a whole number, 1 or more." };
  if (d.machines === "" || !Number.isInteger(machines) || machines < 0) return { error: "Planned machines per day must be a whole number, 0 or more." };
  const perWeek = [5, 6, 7].includes(Number(d.perWeek)) ? Number(d.perWeek) : 6;
  let budget = null;
  if (d.budget !== undefined && d.budget !== "") { budget = Number(d.budget); if (isNaN(budget) || budget < 0) return { error: "Planned budget must be a number, 0 or more." }; }
  const keys = monthsInRange(d.startDate, d.endDate);
  if (keys.length > 240) return { error: "The plan can't be longer than 20 years." };
  const wdList = keys.map(k => workingDaysInMonthWithinPlan(k, d.startDate, d.endDate, perWeek));
  const totalWd = wdList.reduce((s, v) => s + v, 0);
  if (totalWd === 0) return { error: "There is no working day inside this date range." };
  const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  const months = [];
  let cumWd = 0, prevCum = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const o = (d.overrides && d.overrides[k]) || {};
    const label = monthLabel(k);
    cumWd += wdList[i];
    const isLast = i === keys.length - 1;
    const w = num(o.workers) === null ? workers : num(o.workers);
    const mc = num(o.machines) === null ? machines : num(o.machines);
    if (!Number.isInteger(w) || w < 0) return { error: `${label}: workers per day must be a whole number (0 or more).` };
    if (!Number.isInteger(mc) || mc < 0) return { error: `${label}: machines per day must be a whole number (0 or more).` };
    let cum;
    if (isLast) cum = 100;
    else {
      const c = num(o.cum);
      if (c === null) cum = Math.max(prevCum, round1((cumWd / totalWd) * 100));
      else {
        if (isNaN(c) || c < 0 || c > 100) return { error: `${label}: progress target must be between 0 and 100.` };
        if (c < prevCum) return { error: `${label}: progress target can't be lower than the previous month (${prevCum}%).` };
        cum = c;
      }
    }
    prevCum = cum;
    months.push({ key: k, workingDays: wdList[i], workers: w, machines: mc, cum });
  }
  return {
    plan: {
      startDate: d.startDate, endDate: d.endDate, perWeek, workers, machines, budget, months,
      totalWorkingDays: totalWd, savedAt: new Date().toISOString(),
    },
  };
}
function planToForm(plan) {
  const overrides = {};
  plan.months.forEach(m => { overrides[m.key] = { workers: String(m.workers), machines: String(m.machines), cum: String(m.cum) }; });
  return {
    startDate: plan.startDate, endDate: plan.endDate, perWeek: String(plan.perWeek),
    workers: String(plan.workers), machines: String(plan.machines), budget: plan.budget ? String(plan.budget) : "", overrides,
  };
}

/* ---- planned progress curve: day by day, from the monthly cumulative targets ---- */
function buildCurve(plan) {
  const out = [];
  const total = diffDays(plan.startDate, plan.endDate);
  let curKey = null, idx = 0, done = 0;
  for (let i = 0; i <= total; i++) {
    const d = addDays(plan.startDate, i);
    const key = monthKey(d);
    if (key !== curKey) { curKey = key; idx = plan.months.findIndex(m => m.key === key); done = 0; }
    if (isWorkingDay(d, plan.perWeek)) done++;
    const m = plan.months[idx];
    const prev = idx <= 0 ? 0 : plan.months[idx - 1].cum;
    const cum = d >= plan.endDate ? 100 : (m && m.workingDays ? prev + (m.cum - prev) * (done / m.workingDays) : prev);
    out.push({ date: d, cum });
  }
  return out;
}
// Same thresholds the rest of the app already uses for Schedule vs Actual.
function statusFromVariance(v) {
  if (v === null || v === undefined) return null;
  if (v <= -6) return "Delayed";
  if (v <= -2) return "At Risk";
  if (v >= 4) return "Ahead";
  return "On Track";
}

/* ---- the comparison engine: planned vs actual -> variance, delay, forecast, alerts ---- */
function analyzeTracker(plan, actuals, today) {
  const curve = buildCurve(plan);
  const totalDays = diffDays(plan.startDate, plan.endDate);
  const cumAt = (iso) => (iso < plan.startDate ? 0 : iso >= plan.endDate ? 100 : curve[diffDays(plan.startDate, iso)].cum);
  const monthOf = (iso) => plan.months.find(m => m.key === monthKey(iso));
  const plannedFor = (iso) => {
    const inRange = iso >= plan.startDate && iso <= plan.endDate;
    const working = inRange && isWorkingDay(iso, plan.perWeek);
    const m = monthOf(iso);
    return { inRange, working, workers: working && m ? m.workers : 0, machines: working && m ? m.machines : 0, cum: round1(cumAt(iso)) };
  };

  const entries = [...actuals].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = entries.map(e => {
    const p = plannedFor(e.date);
    const progressVar = e.progress !== null && e.progress !== undefined ? round1(e.progress - p.cum) : null;
    return {
      ...e, working: p.working, plannedWorkers: p.workers, plannedMachines: p.machines, plannedProgress: p.cum,
      workerVar: e.workers - p.workers, machineVar: e.machines - p.machines,
      progressVar, status: statusFromVariance(progressVar),
    };
  });
  const withProgress = rows.filter(r => r.progress !== null && r.progress !== undefined);
  const latest = withProgress.length ? withProgress[withProgress.length - 1] : null;

  // Delay in days: where on the plan should we be for the progress achieved vs where the calendar is today.
  let delayDays = null, aheadDays = null;
  if (latest) {
    const A = latest.progress, pLast = cumAt(latest.date);
    if (A < pLast - 0.05) {
      let dStar = plan.startDate;
      for (const c of curve) { if (c.cum >= A) { dStar = c.date; break; } }
      delayDays = Math.max(0, diffDays(dStar, latest.date));
    } else if (A > pLast + 0.05) {
      let dStar = plan.endDate;
      for (const c of curve) { if (c.cum >= A) { dStar = c.date; break; } }
      aheadDays = Math.max(0, diffDays(latest.date, dStar));
    } else delayDays = 0;
  }

  // Forecast completion from the average pace achieved so far (working days only).
  let forecastEnd = null, projectedDelay = null, rate = null, lowConfidence = false;
  if (latest && latest.progress > 0 && latest.date >= plan.startDate) {
    const elapsed = countWorkingDays(plan.startDate, latest.date, plan.perWeek);
    if (elapsed > 0) {
      rate = latest.progress / elapsed;
      const need = Math.ceil((100 - latest.progress) / rate);
      let d = latest.date, n = 0, guard = 0;
      while (n < need && guard < 20000) { d = addDays(d, 1); guard++; if (isWorkingDay(d, plan.perWeek)) n++; }
      forecastEnd = d;
      projectedDelay = diffDays(plan.endDate, d);
      lowConfidence = withProgress.length < 5;
    }
  }

  // Resource comparison only on planned working days that were actually reported.
  const comp = rows.filter(r => r.working);
  const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0);
  const pMan = sum(comp, r => r.plannedWorkers), aMan = sum(comp, r => r.workers);
  const pMac = sum(comp, r => r.plannedMachines), aMac = sum(comp, r => r.machines);
  const workerShort = pMan > 0 ? ((pMan - aMan) / pMan) * 100 : null;
  const machineShort = pMac > 0 ? ((pMac - aMac) / pMac) * 100 : null;

  // Reporting gaps: planned working days (before today) with no entry.
  const reported = new Set(entries.map(e => e.date));
  const lastCheck = addDays(today, -1) < plan.endDate ? addDays(today, -1) : plan.endDate;
  let missingCount = 0, trailing = 0;
  if (lastCheck >= plan.startDate) {
    for (let d = plan.startDate; d <= lastCheck; d = addDays(d, 1)) if (isWorkingDay(d, plan.perWeek) && !reported.has(d)) missingCount++;
    let counting = true;
    for (let d = lastCheck; d >= plan.startDate && counting; d = addDays(d, -1)) {
      if (!isWorkingDay(d, plan.perWeek)) continue;
      if (reported.has(d)) counting = false; else trailing++;
    }
  }

  // Month-wise table.
  const monthly = plan.months.map(m => {
    const me = rows.filter(r => monthKey(r.date) === m.key);
    const mc = me.filter(r => r.working);
    const mp = me.filter(r => r.progress !== null && r.progress !== undefined);
    const lastP = mp.length ? mp[mp.length - 1] : null;
    const avgW = mc.length ? round1(sum(mc, r => r.workers) / mc.length) : null;
    const avgM = mc.length ? round1(sum(mc, r => r.machines) / mc.length) : null;
    return {
      key: m.key, workingDays: m.workingDays, reportedDays: me.length,
      plannedWorkers: m.workers, plannedMachines: m.machines, plannedMonthEnd: m.cum,
      actualWorkers: avgW, actualMachines: avgM,
      workerVarPct: avgW !== null && m.workers > 0 ? round1(((avgW - m.workers) / m.workers) * 100) : null,
      machineVarPct: avgM !== null && m.machines > 0 ? round1(((avgM - m.machines) / m.machines) * 100) : null,
      manDaysActual: sum(me, r => r.workers), manDaysPlannedReported: m.workers * mc.length, manDaysPlannedFull: m.workers * m.workingDays,
      plannedAtLast: lastP ? lastP.plannedProgress : null, actualProgress: lastP ? lastP.progress : null,
      progressVar: lastP ? lastP.progressVar : null, status: lastP ? lastP.status : null,
    };
  });

  // Alerts: derived only from entered data.
  const alerts = [];
  const sgn = (v) => (v > 0 ? "+" : "") + v;
  if (latest && (latest.status === "Delayed" || latest.status === "At Risk")) {
    alerts.push({
      severity: latest.status === "Delayed" ? "Critical" : "Medium",
      title: latest.status === "Delayed" ? "Schedule delay detected" : "Schedule at risk",
      detail: `Actual progress ${latest.progress}% vs planned ${latest.plannedProgress}% on ${fmtDMY(latest.date)} (${sgn(latest.progressVar)} pts)` +
        (delayDays ? ` — about ${delayDays} day${delayDays === 1 ? "" : "s"} behind plan.` : "."),
    });
  }
  if (projectedDelay !== null && projectedDelay > 0) {
    alerts.push({
      severity: projectedDelay >= 30 ? "Critical" : "High",
      title: "Projected completion later than planned",
      detail: `At the average pace so far, completion lands around ${fmtDMY(forecastEnd)} vs planned ${fmtDMY(plan.endDate)} (+${projectedDelay} days).` +
        (lowConfidence ? " Based on fewer than 5 progress reports, so treat this as an early estimate." : ""),
    });
  }
  if (workerShort !== null && workerShort >= 10) {
    alerts.push({
      severity: workerShort >= 25 ? "Critical" : "High", title: "Workforce below plan",
      detail: `Average ${round1(aMan / comp.length)} workers/day vs ${round1(pMan / comp.length)} planned across ${comp.length} reported working day${comp.length === 1 ? "" : "s"} (${round1(workerShort)}% short).`,
    });
  }
  if (machineShort !== null && machineShort >= 10) {
    alerts.push({
      severity: machineShort >= 25 ? "Critical" : "High", title: "Machines below plan",
      detail: `Average ${round1(aMac / comp.length)} machines/day vs ${round1(pMac / comp.length)} planned across ${comp.length} reported working day${comp.length === 1 ? "" : "s"} (${round1(machineShort)}% short).`,
    });
  }
  if (trailing >= 3) {
    alerts.push({ severity: "Medium", title: "Reporting gap", detail: `No actual entry for the last ${trailing} planned working days. Delay detection is only as current as the last report.` });
  }

  // Delay reasons the team logged (only on days that were behind or short on resources).
  const reasonMap = {};
  rows.forEach(r => {
    if (!r.reason) return;
    const behind = (r.progressVar !== null && r.progressVar < -2) || r.workerVar < 0 || r.machineVar < 0;
    if (behind) reasonMap[r.reason] = (reasonMap[r.reason] || 0) + 1;
  });
  const reasons = Object.entries(reasonMap).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  // Chart data.
  const pointSet = new Set([plan.startDate, plan.endDate]);
  plan.months.forEach(m => {
    const [y, mo] = m.key.split("-").map(Number);
    const last = toISO(new Date(Date.UTC(y, mo, 0)));
    pointSet.add(last > plan.endDate ? plan.endDate : last < plan.startDate ? plan.startDate : last);
  });
  entries.forEach(e => pointSet.add(e.date));
  const progressByDate = {};
  withProgress.forEach(r => { progressByDate[r.date] = r.progress; });
  const chartProgress = [...pointSet].sort().map(d => ({
    date: d, x: diffDays(plan.startDate, d), planned: round1(cumAt(d)),
    actual: progressByDate[d] !== undefined ? progressByDate[d] : null,
  }));
  const chartResources = rows.slice(-45).map(r => ({
    date: r.date, label: fmtShort(r.date), plannedWorkers: r.plannedWorkers, actualWorkers: r.workers,
    plannedMachines: r.plannedMachines, actualMachines: r.machines,
  }));

  const overall = !entries.length ? { key: null, label: "No actual data yet" }
    : !latest ? { key: null, label: "No progress data" } : { key: latest.status, label: latest.status };

  return {
    rows, monthly, latest, delayDays, aheadDays, overall, forecastEnd, projectedDelay, lowConfidence, rate,
    resources: { pMan, aMan, pMac, aMac, workerShort, machineShort, compDays: comp.length },
    missing: { count: missingCount, trailing }, alerts, reasons, plannedFor, chartProgress, chartResources, totalDays, cumAt, curve,
  };
}

/* ---- shared input styles ---- */
const trkInput = (theme) => ({
  width: "100%", padding: "9px 11px", borderRadius: 3, border: `1px solid ${theme.border}`, background: theme.panelAlt,
  color: theme.text, fontFamily: FONT_UI, fontSize: 13, outline: "none",
  colorScheme: theme.bg === THEME.dark.bg ? "dark" : "light",
});
const trkLabel = (theme) => ({ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, fontWeight: 700, display: "block", marginBottom: 4 });

/* =========================================================================
   PLAN FIELDS — shared by "Add New Project" and "Edit Plan"
   ========================================================================= */
function PlanFields({ theme, form, set, setOverride }) {
  const inputStyle = trkInput(theme);
  const labelStyle = trkLabel(theme);
  const perWeek = Number(form.perWeek) || 6;
  const rangeOk = isValidISO(form.startDate) && isValidISO(form.endDate) && form.endDate > form.startDate;
  const months = useMemo(() => {
    if (!rangeOk) return [];
    const keys = monthsInRange(form.startDate, form.endDate);
    if (keys.length > 240) return [];
    return keys.map(k => ({ key: k, workingDays: workingDaysInMonthWithinPlan(k, form.startDate, form.endDate, perWeek) }));
  }, [rangeOk, form.startDate, form.endDate, perWeek]);
  const totalWd = months.reduce((s, m) => s + m.workingDays, 0);
  const dW = form.workers === "" ? NaN : Number(form.workers);
  const dM = form.machines === "" ? NaN : Number(form.machines);
  let cumWd = 0, manDays = 0, macDays = 0;
  const rows = months.map((m, i) => {
    cumWd += m.workingDays;
    const o = form.overrides[m.key] || {};
    const w = o.workers !== undefined && o.workers !== "" ? Number(o.workers) : dW;
    const mc = o.machines !== undefined && o.machines !== "" ? Number(o.machines) : dM;
    if (!isNaN(w)) manDays += w * m.workingDays;
    if (!isNaN(mc)) macDays += mc * m.workingDays;
    return { ...m, o, isLast: i === months.length - 1, linear: totalWd ? round1((cumWd / totalWd) * 100) : 0 };
  });
  const cell = { padding: "6px 8px", fontFamily: FONT_UI, fontSize: 12.5, color: theme.text };
  const small = { ...inputStyle, padding: "6px 8px", fontSize: 12.5, fontFamily: FONT_MONO };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Working days per week</label>
          <select style={inputStyle} className="bs-input-focus" value={form.perWeek} onChange={e => set("perWeek", e.target.value)}>
            <option value="6">6 days (Mon–Sat)</option>
            <option value="5">5 days (Mon–Fri)</option>
            <option value="7">7 days (all days)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Planned workers per day</label>
          <input type="number" min="1" style={inputStyle} className="bs-input-focus" placeholder="e.g. 120" value={form.workers} onChange={e => set("workers", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Planned machines per day</label>
          <input type="number" min="0" style={inputStyle} className="bs-input-focus" placeholder="e.g. 14" value={form.machines} onChange={e => set("machines", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Planned budget ₹ (optional)</label>
          <input type="number" min="0" style={inputStyle} className="bs-input-focus" placeholder="e.g. 620000000" value={form.budget || ""} onChange={e => set("budget", e.target.value)} />
        </div>
      </div>

      {rangeOk && months.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 800, color: theme.text }}>Monthly plan</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textMuted, margin: "2px 0 8px" }}>
            Months below default to your daily plan, with progress split evenly over working days. Change any month to match your real plan — Sundays/holidays are not tracked separately.
          </div>
          <div style={{ maxHeight: 230, overflow: "auto", border: `1px solid ${theme.borderSoft}`, borderRadius: 3 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: theme.panel }}>
                  {["Month", "Working days", "Workers / day", "Machines / day", "Cumulative progress target %"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "7px 8px", fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                    <td style={{ ...cell, fontWeight: 700 }}>{monthLabel(r.key)}</td>
                    <td style={{ ...cell, fontFamily: FONT_MONO }}>{r.workingDays}</td>
                    <td style={cell}><input type="number" min="0" className="bs-input-focus" style={small} placeholder={form.workers || "—"}
                      value={r.o.workers === undefined ? "" : r.o.workers} onChange={e => setOverride(r.key, "workers", e.target.value)} /></td>
                    <td style={cell}><input type="number" min="0" className="bs-input-focus" style={small} placeholder={form.machines || "—"}
                      value={r.o.machines === undefined ? "" : r.o.machines} onChange={e => setOverride(r.key, "machines", e.target.value)} /></td>
                    <td style={cell}>
                      {r.isLast
                        ? <span style={{ fontFamily: FONT_MONO, color: theme.textMuted }}>100 (project complete)</span>
                        : <input type="number" min="0" max="100" className="bs-input-focus" style={small} placeholder={String(r.linear)}
                            value={r.o.cum === undefined ? "" : r.o.cum} onChange={e => setOverride(r.key, "cum", e.target.value)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontFamily: FONT_MONO, fontSize: 11.5, color: theme.textMuted }}>
            {totalWd} working days
            {!isNaN(dW) && <> · planned man-days ≈ {manDays.toLocaleString()}</>}
            {!isNaN(dM) && <> · planned machine-days ≈ {macDays.toLocaleString()}</>}
          </div>
        </div>
      )}
      {!rangeOk && (
        <div style={{ marginTop: 12, fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }}>
          Enter a Start Date and a Planned Completion Date to see the month-by-month plan.
        </div>
      )}
    </div>
  );
}

function PlanEditorModal({ theme, project, plan, onClose, onSave }) {
  const [form, setForm] = useState(plan ? planToForm(plan) : { startDate: "", endDate: "", perWeek: "6", workers: "", machines: "", budget: "", overrides: {} });
  const [error, setError] = useState("");
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (error) setError(""); };
  const setOverride = (key, field, v) => { setForm(f => ({ ...f, overrides: { ...f.overrides, [key]: { ...(f.overrides[key] || {}), [field]: v } } })); if (error) setError(""); };
  const inputStyle = trkInput(theme);
  const labelStyle = trkLabel(theme);
  const submit = () => {
    const r = resolvePlan(form);
    if (r.error) { setError(r.error); return; }
    onSave(r.plan);
  };
  return (
    <Modal theme={theme} title={plan ? "Edit Planned Data" : "Add Planned Data"} onClose={onClose} width={780}>
      <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginBottom: 12 }}>
        {project.name} — this plan is the baseline every actual entry is compared against.
        {plan && " Changing it also changes the comparison for entries already saved."}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>Start Date <span style={{ color: theme.red }}>*</span></label>
          <input type="date" style={inputStyle} className="bs-input-focus" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></div>
        <div><label style={labelStyle}>Planned Completion Date <span style={{ color: theme.red }}>*</span></label>
          <input type="date" style={inputStyle} className="bs-input-focus" value={form.endDate} onChange={e => set("endDate", e.target.value)} /></div>
      </div>
      <PlanFields theme={theme} form={form} set={set} setOverride={setOverride} />
      {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Button theme={theme} icon={Check} onClick={submit}>Save Plan</Button>
        <Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

/* =========================================================================
   SITE PHOTO COUNTER — pre-trained models running in the browser count the
   visible workers and machines in photos (only the counts are stored,
   never the photos)
   ========================================================================= */
// Any photo format: no filter in the file picker. JPG/JPEG/JFIF, PNG, WebP, GIF, BMP, AVIF, SVG are read by the browser;
// HEIC/HEIF (iPhone) and TIFF are converted in the browser, and the real format is detected from the file contents, so a wrong or missing extension is fine.
const IMG_ACCEPT = "*/*";
function decodeImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
let _heicPromise = null;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (_heicPromise) return _heicPromise;
  _heicPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => { s.remove(); _heicPromise = null; reject(new Error("heic")); };
    document.head.appendChild(s);
  });
  return _heicPromise;
}
let _tiffPromise = null;
function loadTiffLib() {
  if (window.UTIF) return Promise.resolve(window.UTIF);
  if (_tiffPromise) return _tiffPromise;
  _tiffPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js";
    s.onload = () => resolve(window.UTIF);
    s.onerror = () => { s.remove(); _tiffPromise = null; reject(new Error("tiff")); };
    document.head.appendChild(s);
  });
  return _tiffPromise;
}
async function tiffToJpegBlob(file) {
  const UTIF = await loadTiffLib();
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error("tiff");
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const c = document.createElement("canvas"); c.width = ifds[0].width; c.height = ifds[0].height;
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), c.width, c.height), 0, 0);
  return await new Promise(res => c.toBlob(res, "image/jpeg", 0.92));
}
// Detect the real format from the first bytes, so the file name / extension / MIME type don't matter.
async function sniffKind(file) {
  try {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const s = String.fromCharCode(...b);
    if ((s.slice(0, 2) === "II" && b[2] === 42 && b[3] === 0) || (s.slice(0, 2) === "MM" && b[2] === 0 && b[3] === 42)) return "tiff";
    if (s.slice(4, 8) === "ftyp" && /^(hei[cxms]|hev[cms]|mif1|msf1)$/i.test(s.slice(8, 12))) return "heic";
  } catch (e) {}
  const n = file.name || "", t = file.type || "";
  if (/hei[cf]/i.test(t) || /\.hei[cf]$/i.test(n)) return "heic";
  if (/tiff?/i.test(t) || /\.tiff?$/i.test(n)) return "tiff";
  return "";
}
async function resizeImage(file, maxDim = 1280, quality = 0.8) {
  let dec;
  try { dec = await decodeImage(file); }
  catch (e) {
    const kind = await sniffKind(file);
    const nm = file.name || "this file";
    if (kind === "heic") {
      try {
        const lib = await loadHeicLib();
        const out = await lib({ blob: file, toType: "image/jpeg", quality: 0.9 });
        dec = await decodeImage(Array.isArray(out) ? out[0] : out);
      } catch (e2) { throw new Error(`The HEIC photo "${nm}" couldn't be converted here. Save or share it as JPG and try again.`); }
    } else if (kind === "tiff") {
      try { dec = await decodeImage(await tiffToJpegBlob(file)); }
      catch (e2) { throw new Error(`The TIFF photo "${nm}" couldn't be converted here. Save it as JPG or PNG and try again.`); }
    } else {
      throw new Error(`Couldn't read "${nm}" as a photo. JPG, PNG, WebP, GIF, BMP, AVIF, SVG, HEIC and TIFF work; for RAW, PDF or other formats save it as JPG first.`);
    }
  }
  const { img, url } = dec;
  const w = img.naturalWidth || img.width || 1024, h = img.naturalHeight || img.height || 1024;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); // transparent PNG / WebP / GIF areas become white, not black
  g.drawImage(img, 0, 0, c.width, c.height);
  return { url, base64: c.toDataURL("image/jpeg", quality).split(",")[1] };
}
/* ---- ONE pre-trained model, running inside the browser (nothing is uploaded) ----
   OWL-ViT (Transformers.js) is an open-vocabulary detector: it finds workers AND machines
   (excavator, crane, roller, loader, mixer, truck, paver ...) from plain text labels.
   Workers are also searched in zoomed tiles so small / distant people are not missed.
   The model downloads once; the browser keeps it afterwards. */
const TRANSFORMERS_URLS = ["https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1", "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3"];
const OWL_MODEL = "Xenova/owlvit-base-patch32";
const WORKER_LABELS = ["a photo of a construction worker", "a photo of a person"];
const MACHINE_LABELS = [
  ["excavator", "a photo of an excavator"], ["bulldozer", "a photo of a bulldozer"], ["crane", "a photo of a construction crane"],
  ["dump truck", "a photo of a dump truck"], ["roller", "a photo of a road roller compactor"], ["concrete mixer", "a photo of a concrete mixer truck"],
  ["wheel loader", "a photo of a wheel loader"], ["backhoe loader", "a photo of a backhoe loader"], ["paver", "a photo of an asphalt paver"],
];
const SENSITIVITY = {
  strict: { label: "Strict (fewer false counts)", person: 0.3, machine: 0.25 },
  balanced: { label: "Balanced", person: 0.2, machine: 0.15 },
  sensitive: { label: "Sensitive (finds more, may over-count)", person: 0.12, machine: 0.1 },
};
const ENGINE_FULL = "on-device AI: OWL-ViT (workers + machines)";

/*PURE-START*/
// boxes are [x, y, w, h]
function iouInfo(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return { iou: union > 0 ? inter / union : 0, minCover: inter / Math.max(1e-6, Math.min(a[2] * a[3], b[2] * b[3])) };
}
// Keeps the best box of each overlapping group. coverThr also drops a box sitting (almost) inside a better one,
// which is what a worker cut by a tile edge looks like. Pass coverThr > 1 to switch that off.
function nmsBoxes(dets, iouThr, coverThr) {
  const keep = [];
  [...dets].sort((a, b) => b.score - a.score).forEach(d => {
    if (!keep.some(k => { const o = iouInfo(k.bbox, d.bbox); return o.iou > iouThr || o.minCover > coverThr; })) keep.push(d);
  });
  return keep;
}
function tileRects(W, H) {
  const tw = Math.min(W, Math.round(W * 0.6)), th = Math.min(H, Math.round(H * 0.6));
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => ({ x: Math.round(c * (W - tw)), y: Math.round(r * (H - th)), w: tw, h: th }));
}
// dets: [{cls: "worker" | machine name, score, bbox}] from the full photo and all tiles (tiles only look for workers)
function fuseDetections(dets, W, H, sens) {
  const persons = nmsBoxes(dets.filter(d => d.cls === "worker" && d.score >= sens.person && d.bbox[3] >= 10 && d.bbox[2] * d.bbox[3] < 0.6 * W * H), 0.5, 0.85);
  let machines = nmsBoxes(dets.filter(d => d.cls !== "worker" && d.score >= sens.machine && d.bbox[2] * d.bbox[3] >= W * H * 0.002), 0.45, 2);
  // a "machine" box that is really just one person is not a machine
  machines = machines.filter(m => !persons.some(p => { const o = iouInfo(m.bbox, p.bbox); return o.minCover > 0.7 && m.bbox[2] * m.bbox[3] < 1.3 * p.bbox[2] * p.bbox[3]; }));
  return { persons, machines };
}
/*PURE-END*/

let _owlPromise = null, _owlProgressCb = null;
const _owlFiles = {};
function owlProgress(p) {
  if (!p || !p.file) return;
  if (p.status === "progress" && p.total) _owlFiles[p.file] = { l: p.loaded, t: p.total };
  else if (p.status === "done" && _owlFiles[p.file]) _owlFiles[p.file].l = _owlFiles[p.file].t;
  const v = Object.values(_owlFiles), T = v.reduce((s, x) => s + x.t, 0), L = v.reduce((s, x) => s + x.l, 0);
  if (_owlProgressCb && T) _owlProgressCb(Math.min(100, Math.round((L / T) * 100)), Math.round(T / 1048576));
}
function loadOwl() {
  if (_owlPromise) return _owlPromise;
  _owlPromise = (async () => {
    let tx = null, lastErr = null;
    for (const u of TRANSFORMERS_URLS) {
      try { tx = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ u); break; } catch (e) { lastErr = e; }
    }
    if (!tx) throw lastErr || new Error("transformers.js did not load");
    return await tx.pipeline("zero-shot-object-detection", OWL_MODEL, { device: "wasm", dtype: "q8", progress_callback: owlProgress });
  })().catch(() => {
    _owlPromise = null;
    throw new Error("The AI model could not be downloaded. It needs internet once (about 150 MB) — check the connection and try again.");
  });
  return _owlPromise;
}
function loadImgFromB64(b64) {
  return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("Could not read the photo.")); im.src = `data:image/jpeg;base64,${b64}`; });
}
// Counts workers and machines in one photo and draws the boxes so the result can be checked by eye.
async function detectPhoto(base64, sens, setStep) {
  const img = await loadImgFromB64(base64);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const src = document.createElement("canvas");
  src.width = W; src.height = H;
  src.getContext("2d").drawImage(img, 0, 0);

  setStep("Loading the AI model (first time only)…");
  const owl = await loadOwl();
  const clsOf = {};
  WORKER_LABELS.forEach(l => { clsOf[l] = "worker"; });
  MACHINE_LABELS.forEach(m => { clsOf[m[1]] = m[0]; });
  const dets = [];
  const run = async (input, labels, ox, oy) => {
    const out = await owl(input, labels, { threshold: 0.08, top_k: 100 });
    (out || []).forEach(o => dets.push({ cls: clsOf[o.label] || "worker", score: o.score, bbox: [o.box.xmin + ox, o.box.ymin + oy, o.box.xmax - o.box.xmin, o.box.ymax - o.box.ymin] }));
  };
  setStep("Counting workers and machines…");
  await run(`data:image/jpeg;base64,${base64}`, [...WORKER_LABELS, ...MACHINE_LABELS.map(m => m[1])], 0, 0);
  const tiles = tileRects(W, H);
  const tc = document.createElement("canvas");
  let n = 0;
  for (const t of tiles) {
    n++;
    setStep(`Looking closer for small workers (${n}/${tiles.length})…`);
    tc.width = t.w; tc.height = t.h;
    tc.getContext("2d").drawImage(src, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    await run(tc.toDataURL("image/jpeg", 0.85), WORKER_LABELS, t.x, t.y);
  }

  const { persons, machines } = fuseDetections(dets, W, H, sens);

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.lineWidth = Math.max(2, W / 400); g.font = `${Math.max(11, Math.round(W / 60))}px sans-serif`;
  const draw = (d, col, name) => { g.strokeStyle = col; g.fillStyle = col; g.strokeRect(d.bbox[0], d.bbox[1], d.bbox[2], d.bbox[3]); g.fillText(`${name} ${Math.round(d.score * 100)}%`, d.bbox[0] + 2, Math.max(12, d.bbox[1] - 3)); };
  persons.forEach(p => draw(p, "#3DDC84", "worker"));
  machines.forEach(m => draw(m, "#FFB020", m.cls));

  const types = {};
  machines.forEach(m => { types[m.cls] = (types[m.cls] || 0) + 1; });
  const machineList = Object.entries(types).map(([type, count]) => ({ type, count }));
  const avg = (a) => (a.length ? a.reduce((s, d) => s + d.score, 0) / a.length : null);
  const mp = avg(persons), mm = avg(machines);
  const cp = mp === null ? null : mp >= 0.4 ? "high" : mp >= 0.28 ? "medium" : "low";
  const cm = mm === null ? null : mm >= 0.4 ? "high" : mm >= 0.25 ? "medium" : "low";
  const order = { low: 0, medium: 1, high: 2 };
  let confidence = [cp, cm].filter(Boolean).reduce((a, b) => (order[a] <= order[b] ? a : b), "high");
  if (cp === null && cm === null) confidence = "low";
  if (persons.length > 30 && confidence === "high") confidence = "medium";
  const mText = machineList.length ? machineList.map(m => `${m.count} ${m.type}`).join(", ") : "none found";
  const notes = `Workers: ${persons.length}. Machines: ${mText}.`;
  return { persons: persons.length, machines: machineList, confidence, annotated: c.toDataURL("image/jpeg", 0.7), notes };
}

function SitePhotoCounter({ theme, date, onCounted }) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [autoSave, setAutoSave] = useState(true);
  const [sensKey, setSensKey] = useState("balanced");
  const [msg, setMsg] = useState(null);
  const [camOpen, setCamOpen] = useState(false);
  const [camStarting, setCamStarting] = useState(false);
  const [facing, setFacing] = useState("environment");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const capInputRef = useRef(null);
  const cbRef = useRef(onCounted); cbRef.current = onCounted;
  const photosRef = useRef(photos); photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach(p => URL.revokeObjectURL(p.url)), []);

  // ---- camera: one click opens it; if the page can't use the live camera, the device's own camera app / picker opens instead ----
  const stopStream = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } };
  const closeCamera = () => { stopStream(); setCamOpen(false); };
  const openNativeCamera = () => { if (capInputRef.current) capInputRef.current.click(); };
  const startCamera = async (face) => {
    if (camStarting || photosRef.current.length >= 4) return false;
    setMsg(null);
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      setMsg({ kind: "err", text: window.isSecureContext ? "Is browser mein live camera support nahi hai." : "Camera sirf HTTPS ya localhost par chalta hai. Page ko https:// se kholo." });
      if (isMobile) openNativeCamera();
      return false;
    }
    setCamStarting(true);
    try {
      stopStream();
      let stream;
      try { stream = await md.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch (e1) {
        if (e1 && (e1.name === "OverconstrainedError" || e1.name === "NotFoundError")) stream = await md.getUserMedia({ video: true, audio: false });
        else throw e1;
      }
      streamRef.current = stream;
      setCamOpen(true);
      // Flip ke case mein camOpen pehle se true hota hai, isliye video ko seedha naya stream do
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      return true;
    } catch (e) {
      const reasons = {
        NotAllowedError: "Camera permission block hai. Address bar ke lock icon se Camera ko Allow karo. Agar app iframe mein hai to iframe par allow=\"camera\" lagao.",
        NotFoundError: "Is device mein camera nahi mila.",
        NotReadableError: "Camera kisi aur app ya tab mein use ho raha hai. Use band karke dobara try karo.",
        SecurityError: "Security policy camera ko block kar rahi hai (HTTPS ya Permissions-Policy check karo).",
      };
      setMsg({ kind: "err", text: reasons[e && e.name] || `Camera error: ${e && (e.message || e.name)}` });
      if (isMobile) openNativeCamera();
      return false;
    }
    finally { setCamStarting(false); }
  };
  const flipCamera = () => { const nf = facing === "environment" ? "user" : "environment"; setFacing(nf); startCamera(nf); };
  useEffect(() => { if (camOpen && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {}); } }, [camOpen]);
  useEffect(() => () => stopStream(), []);
  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    if (photosRef.current.length >= 4) return;
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(v.videoWidth * scale); cv.height = Math.round(v.videoHeight * scale);
    cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.85));
    const base64 = cv.toDataURL("image/jpeg", 0.85).split(",")[1];
    const url = URL.createObjectURL(blob);
    const n = photosRef.current.length + 1;
    setPhotos(p => [...p, { id: newId("ph"), name: `camera-${n}.jpg`, url, base64, result: null, annotated: null }]);
    setMsg(null);
    if (n >= 4) closeCamera();
  };
  // One click: open the live camera and take the first photo by itself as soon as the picture is ready.
  const quickPhoto = async () => {
    const ok = await startCamera(facing);
    if (!ok) return;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && v.readyState >= 2) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 600)); // let auto-exposure settle
    await captureFrame();
  };
  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - photos.length));
    e.target.value = "";
    setMsg(null);
    for (const file of files) {
      try { const r = await resizeImage(file); setPhotos(p => [...p, { id: newId("ph"), name: file.name, url: r.url, base64: r.base64, result: null, annotated: null }]); }
      catch (err) { setMsg({ kind: "err", text: err.message }); }
    }
  };
  const remove = (id) => setPhotos(p => { const x = p.find(q => q.id === id); if (x) URL.revokeObjectURL(x.url); return p.filter(q => q.id !== id); });
  const rank = { low: 0, medium: 1, high: 2 };
  const lowest = (a, b) => (rank[a] <= rank[b] ? a : b);

  const analyze = async () => {
    if (!photos.length || busy) return;
    closeCamera();
    setBusy(true); setMsg(null);
    const sens = SENSITIVITY[sensKey];
    const results = [];
    _owlProgressCb = (pct, mb) => setPhase(`Downloading the AI model (one-time, about ${mb} MB) — ${pct}%`);
    try {
      for (const p of photosRef.current) {
        const d = await detectPhoto(p.base64, sens, setPhase);
        const res = { workers: d.persons, machines: d.machines, confidence: d.confidence, notes: d.notes };
        results.push(res);
        setPhotos(list => list.map(q => (q.id === p.id ? { ...q, annotated: d.annotated, result: res } : q)));
      }
    } catch (err) { _owlProgressCb = null; setMsg({ kind: "err", text: err.message }); setBusy(false); setPhase(""); return; }
    _owlProgressCb = null;
    // The same people can appear in several photos, so use the highest count per photo (and per machine type), never a sum.
    const workers = Math.max(...results.map(r => r.workers));
    const types = {};
    results.forEach(r => r.machines.forEach(m => { if (m.count > 0) types[m.type] = Math.max(types[m.type] || 0, m.count); }));
    const machineTypes = Object.entries(types).map(([type, count]) => ({ type, count }));
    const machines = machineTypes.reduce((s, m) => s + m.count, 0);
    const confidence = results.reduce((c, r) => lowest(c, r.confidence), "high");
    const meta = { source: "photo", engine: ENGINE_FULL, workers, machines, machineTypes, confidence, photos: results.length, notes: "", at: new Date().toISOString() };
    const out = cbRef.current({ workers, machines, confidence, meta }, autoSave) || {};
    const typeText = machineTypes.length ? ` (${machineTypes.map(m => `${m.count} ${m.type}`).join(", ")})` : "";
    if (out.error) setMsg({ kind: "err", text: `Counted ${workers} workers and ${machines} machines, but couldn't save: ${out.error}` });
    else if (out.saved) setMsg({ kind: "ok", text: `Saved for ${fmtDMY(date)}: ${workers} workers, ${machines} machines${typeText} from ${results.length} photo${results.length === 1 ? "" : "s"} (${confidence} confidence). The boxes on the photos show what was counted — edit the report if it looks off.` });
    else if (out.lowConfidence) setMsg({ kind: "warn", text: `Filled ${workers} workers, ${machines} machines${typeText}, but NOT saved because confidence is low. Check the boxes on the photos, try another sensitivity, then press Save.` });
    else setMsg({ kind: "ok", text: `Filled ${workers} workers, ${machines} machines${typeText} (${confidence} confidence). Review them and press Save.` });
    setBusy(false); setPhase("");
  };
  const col = msg ? (msg.kind === "ok" ? theme.green : msg.kind === "warn" ? theme.warn : theme.red) : theme.text;
  return (
    <div style={{ marginTop: 14, border: `1px dashed ${theme.border}`, borderRadius: 3, padding: 14, background: theme.panelAlt }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Camera size={15} color={theme.accent} />
        <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: theme.text }}>Count workers and machines from site photos</div>
      </div>
      <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Use Quick photo (opens the camera and clicks a photo right away) or Live camera (see the picture, capture when ready). Take up to 4 photos for {fmtDMY(date)}, then press Count. A pre-trained AI runs inside your browser (no upload; the first use downloads it once, roughly 150 MB). Results are estimates, are marked with a camera icon in the table, and can be edited.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: theme.text }}>Sensitivity</label>
        <select disabled={busy} value={sensKey} onChange={e => setSensKey(e.target.value)} style={{ ...trkInput(theme), width: "auto", padding: "6px 10px" }}>
          {Object.entries(SENSITIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: photos.length ? 10 : 0 }}>
        {photos.map(p => (
          <div key={p.id} style={{ width: 150 }}>
            <div style={{ position: "relative", width: 150, height: 108, borderRadius: 3, overflow: "hidden", border: `1px solid ${theme.border}` }}>
              <img src={p.annotated || p.url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {!busy && <button onClick={() => remove(p.id)} title="Remove photo" style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 999, border: "none", background: "#000000aa", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}><X size={12} /></button>}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: theme.textMuted, marginTop: 3 }}>{p.result ? `${p.result.workers} workers · ${p.result.machines.reduce((s, m) => s + m.count, 0)} machines` : busy ? "analysing…" : "ready"}</div>
          </div>))}
      </div>
      {camOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000000ee", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 16 }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 720, borderRadius: 3, overflow: "hidden", background: "#000", border: `1px solid ${theme.border}` }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", minHeight: 200, transform: facing === "user" ? "scaleX(-1)" : "none" }} />
            <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: "#fff", background: "#000000aa", borderRadius: 3, padding: "3px 8px" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#EF5B5B" }} />LIVE · {photos.length}/4 captured
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <Button theme={theme} small kind="subtle" icon={SwitchCamera} onClick={flipCamera}>Flip</Button>
            <button onClick={captureFrame} title="Take photo" aria-label="Take photo" style={{ width: 68, height: 68, borderRadius: 999, border: "4px solid #fff", background: theme.accent, cursor: "pointer", boxShadow: "0 0 0 4px #00000066" }} />
            <Button theme={theme} small kind="subtle" icon={VideoOff} onClick={closeCamera}>{photos.length ? "Done" : "Close"}</Button>
          </div>
        </div>)}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {photos.length < 4 && !camOpen && <Button theme={theme} small icon={Camera} onClick={quickPhoto}>{camStarting ? "Opening camera…" : "Quick photo (1 click)"}</Button>}
        {photos.length < 4 && !camOpen && <Button theme={theme} small kind="subtle" icon={Video} onClick={() => startCamera(facing)}>Live camera</Button>}
        {photos.length < 4 && (
          <label style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "8px 12px", cursor: busy ? "default" : "pointer", background: theme.panel, opacity: busy ? 0.6 : 1 }}>
            {photos.length ? "Add more" : "Add photos"}<input type="file" accept={IMG_ACCEPT} multiple disabled={busy} onChange={addFiles} style={{ display: "none" }} />
          </label>)}
        <input ref={capInputRef} type="file" accept="image/*" capture="environment" disabled={busy} onChange={addFiles} style={{ display: "none" }} />
        <Button theme={theme} small kind="subtle" icon={Sparkles} onClick={analyze}>{busy ? "Counting…" : "Count from photos"}</Button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} /> Save to this date's report automatically
        </label>
      </div>
      {busy && phase && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }}>{phase}</div>}
      {msg && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: col, fontWeight: 600, lineHeight: 1.5 }}>{msg.text}</div>}
    </div>
  );
}

/* =========================================================================
   PLANNED vs ACTUAL TRACKER PAGE
   ========================================================================= */
function PlanVsActualTracker({ theme, project, tracker, trackerLoaded, onSavePlan, onSaveActual, onDeleteActual, onEditEntry, setView, pushToast }) {
  const plan = tracker && tracker.plan;
  const actuals = (tracker && tracker.actuals) || [];
  const today = todayISO();
  const [planOpen, setPlanOpen] = useState(false);
  const [tab, setTab] = useState("daily");
  const [chartMode, setChartMode] = useState("progress");
  const [dailyLimit, setDailyLimit] = useState(30);

  useEffect(() => { setDailyLimit(30); }, [project.id]);

  const a = useMemo(() => (plan ? analyzeTracker(plan, actuals, today) : null), [plan, actuals, today]);

  const tickerItems = plan && a ? [
    `📅 Plan: ${fmtDMY(plan.startDate)} → ${fmtDMY(plan.endDate)} (${plan.totalWorkingDays} working days)`,
    `👷 Planned ${plan.workers} workers · ${plan.machines} machines per day`,
    `📝 ${actuals.length} actual report${actuals.length === 1 ? "" : "s"} entered`,
    a.latest ? `📊 Latest: ${a.latest.progress}% actual vs ${a.latest.plannedProgress}% planned` : `ℹ️ Enter actual progress % to detect schedule delay`,
  ] : [`Planned vs actual tracking for ${project.name}`];

  const hero = (
    <PageHero theme={theme} icon={GitCompareArrows} title="Planned vs Actual Tracker"
      subtitle={`${project.name} — enter your plan once, report actuals daily, and delays are detected from the difference`}
      tickerItems={tickerItems}
      right={plan ? <div style={{ display: "flex", gap: 8 }}><Button theme={theme} kind="subtle" small icon={ClipboardList} onClick={() => setView && setView("dataentry")}>Data Entry</Button><Button theme={theme} kind="subtle" small icon={Pencil} onClick={() => setPlanOpen(true)}>Edit Plan</Button></div> : null} />
  );

  if (!trackerLoaded) {
    return <div>{hero}<Card theme={theme}><div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Loading saved plan data…</div></Card></div>;
  }

  if (!plan || !a) {
    return (
      <div>
        {hero}
        <Card theme={theme} style={{ textAlign: "center", padding: 36 }}>
          <div style={{ width: 46, height: 46, borderRadius: 3, background: theme.accentSoft, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
            <CalendarDays size={22} color={theme.accent} />
          </div>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: theme.text }}>No planned data for this project yet</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, margin: "6px auto 16px", maxWidth: 520 }}>
            Add how long the project will take and how many workers and machines you plan to use per day and per month.
            Once actual site data is entered, this page compares it with the plan and detects delay. Nothing is shown until you enter real numbers.
          </div>
          <Button theme={theme} icon={Plus} onClick={() => setPlanOpen(true)}>Add Planned Data</Button>
        </Card>
        {planOpen && <PlanEditorModal theme={theme} project={project} plan={null} onClose={() => setPlanOpen(false)} onSave={(p) => { onSavePlan(p); setPlanOpen(false); }} />}
      </div>
    );
  }

  const startEdit = (r) => { onEditEntry && onEditEntry(r.date); };

  const exportCsv = () => {
    const head = ["Date", "Planned workers", "Actual workers", "Planned machines", "Actual machines", "Planned progress %", "Actual progress %", "Variance (pts)", "Status", "Delay reason", "Remarks"];
    const esc = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(",")].concat(a.rows.map(r => [
      r.date, r.plannedWorkers, r.workers, r.plannedMachines, r.machines, r.plannedProgress, r.progress, r.progressVar, r.status || "", r.reason || "", r.remarks || "",
    ].map(esc).join(",")));
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${slug}-planned-vs-actual.csv`);
    pushToast && pushToast(`Exported ${a.rows.length} day${a.rows.length === 1 ? "" : "s"} to CSV.`);
  };

  const tone = { Ahead: theme.green, "On Track": theme.blue, "At Risk": theme.warn, Delayed: theme.red };
  const varColor = (v, invert) => (v === null || v === undefined || v === 0 ? theme.textMuted : (invert ? v > 0 : v < 0) ? theme.red : theme.green);
  const signed = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}${suffix}`);
  const th = { textAlign: "left", padding: "8px 10px", fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, fontWeight: 700, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontFamily: FONT_MONO, fontSize: 12.5, color: theme.text, whiteSpace: "nowrap" };
  const R = a.resources;
  const statTile = (label, value, sub, color) => (
    <Card theme={theme} style={{ minWidth: 0 }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: color || theme.text, marginTop: 8, letterSpacing: -0.4 }}>{value}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>
    </Card>
  );
  const tooltipStyle = { background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, fontFamily: FONT_UI, fontSize: 12, color: theme.text };
  const axis = { stroke: theme.textFaint, fontSize: 11, fontFamily: FONT_MONO };
  const maxX = Math.max(a.totalDays, ...a.chartProgress.map(p => p.x));

  return (
    <div>
      {hero}

      {/* ---- summary ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        {statTile("Schedule status",
          a.overall.key ? <StatusBadge theme={theme} status={a.overall.key} /> : <span style={{ fontSize: 14, color: theme.textMuted }}>{a.overall.label}</span>,
          a.latest ? `Actual ${a.latest.progress}% vs planned ${a.latest.plannedProgress}% on ${fmtDMY(a.latest.date)} (${signed(a.latest.progressVar)} pts)` : "Add the cumulative progress % in a daily entry to detect schedule delay.")}
        {statTile("Delay vs plan",
          a.delayDays === null && a.aheadDays === null ? "—" : a.delayDays > 0 ? `${a.delayDays} day${a.delayDays === 1 ? "" : "s"} behind` : a.aheadDays > 0 ? `${a.aheadDays} day${a.aheadDays === 1 ? "" : "s"} ahead` : "On plan",
          a.latest ? "Calendar days between when the plan expected this progress and the latest report." : "Needs at least one entry with progress %.",
          a.delayDays > 0 ? theme.red : a.aheadDays > 0 ? theme.green : theme.text)}
        {statTile("Completion",
          a.forecastEnd ? fmtDMY(a.forecastEnd) : "—",
          a.forecastEnd
            ? `Planned ${fmtDMY(plan.endDate)} · ${a.projectedDelay > 0 ? `+${a.projectedDelay} days late` : a.projectedDelay < 0 ? `${-a.projectedDelay} days early` : "on time"} at current pace${a.lowConfidence ? " (early estimate)" : ""}`
            : `Planned ${fmtDMY(plan.endDate)}. Forecast appears once progress % is reported.`,
          a.projectedDelay > 0 ? theme.red : a.projectedDelay < 0 ? theme.green : theme.text)}
        {statTile("Resources vs plan",
          R.compDays ? `${R.workerShort === null ? "—" : `${R.workerShort > 0 ? "−" : "+"}${Math.abs(round1(R.workerShort))}%`} workers` : "—",
          R.compDays ? `Machines ${R.machineShort === null ? "n/a" : `${R.machineShort > 0 ? "−" : "+"}${Math.abs(round1(R.machineShort))}%`} · over ${R.compDays} reported working day${R.compDays === 1 ? "" : "s"}` : "Appears after the first entry on a planned working day.",
          R.workerShort !== null && R.workerShort >= 10 ? theme.red : theme.text)}
      </div>

      {/* ---- alerts ---- */}
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Delay detection" sub={`Status rule: ≤ −6 pts Delayed · ≤ −2 pts At Risk · ≥ +4 pts Ahead (planned vs actual cumulative progress). ${a.missing.count} planned working day${a.missing.count === 1 ? "" : "s"} have no report so far.`} />
        {a.alerts.length === 0 ? (
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>
            {actuals.length === 0 ? "No actual data yet — add the first daily report in Data Entry."
              : a.latest ? "No delay signal found in the data entered so far." : "Entries have no progress %, so only resource comparison is possible."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.alerts.map((al, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "10px 12px", background: theme.panelAlt }}>
                <StatusBadge theme={theme} status={al.severity} />
                <div>
                  <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: theme.text }}>{al.title}</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{al.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {a.reasons.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, fontWeight: 700 }}>REASONS LOGGED ON BEHIND-PLAN DAYS</span>
            {a.reasons.map(r => (
              <span key={r.reason} style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: theme.text, background: theme.panelAlt, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "3px 10px" }}>
                {r.reason} · {r.count}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ---- chart ---- */}
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Planned vs actual trend"
          sub={chartMode === "progress" ? "Cumulative progress % — dashed line is the plan, dots are reported actuals" : `Daily ${chartMode} — last ${Math.min(45, a.rows.length)} reported days`}
          right={
            <div style={{ display: "flex", gap: 6 }}>
              {[["progress", "Progress"], ["workers", "Workers"], ["machines", "Machines"]].map(([k, l]) => (
                <Button key={k} theme={theme} small kind={chartMode === k ? "primary" : "ghost"} onClick={() => setChartMode(k)}>{l}</Button>
              ))}
            </div>
          } />
        {chartMode !== "progress" && a.chartResources.length === 0 ? (
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, padding: "30px 0", textAlign: "center" }}>No daily entries yet.</div>
        ) : (
          <div style={{ width: "100%", height: 270 }}>
            <LoopRC>
              {chartMode === "progress" ? (
                <LineChart data={a.chartProgress} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                  <XAxis dataKey="x" type="number" domain={[0, maxX]} tickFormatter={(v) => fmtShort(addDays(plan.startDate, v))} {...axis} />
                  <YAxis domain={[0, 100]} unit="%" {...axis} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => fmtDMY(addDays(plan.startDate, v))} formatter={(v, n) => [`${v}%`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="planned" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </LineChart>
              ) : (
                <LineChart data={a.chartResources} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                  <Line isAnimationActive={false} type="stepAfter" dataKey={chartMode === "workers" ? "plannedWorkers" : "plannedMachines"} name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey={chartMode === "workers" ? "actualWorkers" : "actualMachines"} name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              )}
            </LoopRC>
          </div>
        )}
      </Card>

      {/* ---- entry moved to the Data Entry section ---- */}
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, maxWidth: 560 }}>Daily reports, activity progress, cost, safety and Excel paste are now entered in the Data Entry section. This page only compares plan with actual.</div>
          <Button theme={theme} icon={ClipboardList} onClick={() => setView && setView("dataentry")}>Open Data Entry</Button>
        </div>
      </Card>

      {/* ---- comparison tables ---- */}
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Planned vs actual comparison"
          sub={tab === "daily" ? `${a.rows.length} daily report${a.rows.length === 1 ? "" : "s"}` : `${plan.months.length} plan month${plan.months.length === 1 ? "" : "s"}`}
          right={
            <div style={{ display: "flex", gap: 6 }}>
              <Button theme={theme} small kind={tab === "daily" ? "primary" : "ghost"} onClick={() => setTab("daily")}>Daily</Button>
              <Button theme={theme} small kind={tab === "monthly" ? "primary" : "ghost"} onClick={() => setTab("monthly")}>Monthly</Button>
              <Button theme={theme} small kind="ghost" icon={Download} onClick={exportCsv}>Export CSV</Button>
            </div>
          } />
        {tab === "daily" ? (
          a.rows.length === 0 ? (
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, padding: "14px 0" }}>No actual data entered yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {["Date", "Workers plan", "Actual", "Δ", "Machines plan", "Actual", "Δ", "Progress plan", "Actual", "Δ pts", "Status", "Reason", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...a.rows].reverse().slice(0, dailyLimit).map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                      <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{fmtDMY(r.date)}{!r.working && <span title="Not a planned working day" style={{ color: theme.textFaint, fontWeight: 600 }}> *</span>}{r.photo && <span title={`Counted from photos (${r.photo.engine || "AI"}): ${r.photo.workers} workers, ${r.photo.machines} machines, ${r.photo.confidence} confidence`} style={{ marginLeft: 6, verticalAlign: "middle", display: "inline-flex" }}><Camera size={12} color={theme.accent} /></span>}</td>
                      <td style={td}>{r.plannedWorkers}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.workers}</td>
                      <td style={{ ...td, color: varColor(r.working ? r.workerVar : 0), fontWeight: 700 }}>{r.working ? signed(r.workerVar) : "—"}</td>
                      <td style={td}>{r.plannedMachines}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.machines}</td>
                      <td style={{ ...td, color: varColor(r.working ? r.machineVar : 0), fontWeight: 700 }}>{r.working ? signed(r.machineVar) : "—"}</td>
                      <td style={td}>{r.plannedProgress}%</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.progress === null || r.progress === undefined ? "—" : `${r.progress}%`}</td>
                      <td style={{ ...td, color: varColor(r.progressVar), fontWeight: 700 }}>{signed(r.progressVar)}</td>
                      <td style={td}>{r.status ? <StatusBadge theme={theme} status={r.status} /> : <span style={{ color: theme.textFaint }}>—</span>}</td>
                      <td style={{ ...td, fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }} title={r.remarks || ""}>{r.reason || "—"}</td>
                      <td style={td}>
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <IconBtn theme={theme} icon={Pencil} title="Edit report" onClick={() => startEdit(r)} />
                          <IconBtn theme={theme} icon={Trash2} title="Delete report" onClick={() => onDeleteActual(r.date)} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.rows.length > dailyLimit && (
                <div style={{ marginTop: 10 }}><Button theme={theme} small kind="ghost" onClick={() => setDailyLimit(l => l + 30)}>Show 30 more</Button></div>
              )}
              <div style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint }}>* Reported on a day that is not a planned working day.</div>
            </div>
          )
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {["Month", "Reported / working days", "Workers plan/day", "Actual avg", "Δ %", "Machines plan/day", "Actual avg", "Δ %", "Man-days actual vs plan*", "Month-end target", "Plan at last report", "Actual", "Δ pts", "Status"].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {a.monthly.map(m => {
                  const future = m.key > today.slice(0, 7);
                  return (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${theme.borderSoft}`, opacity: future && m.reportedDays === 0 ? 0.55 : 1 }}>
                      <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{monthLabel(m.key)}</td>
                      <td style={td}>{m.reportedDays} / {m.workingDays}</td>
                      <td style={td}>{m.plannedWorkers}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{m.actualWorkers === null ? "—" : m.actualWorkers}</td>
                      <td style={{ ...td, color: varColor(m.workerVarPct), fontWeight: 700 }}>{signed(m.workerVarPct, "%")}</td>
                      <td style={td}>{m.plannedMachines}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{m.actualMachines === null ? "—" : m.actualMachines}</td>
                      <td style={{ ...td, color: varColor(m.machineVarPct), fontWeight: 700 }}>{signed(m.machineVarPct, "%")}</td>
                      <td style={td}>{m.reportedDays ? `${m.manDaysActual.toLocaleString()} vs ${m.manDaysPlannedReported.toLocaleString()}` : "—"}</td>
                      <td style={td}>{m.plannedMonthEnd}%</td>
                      <td style={td}>{m.plannedAtLast === null ? "—" : `${m.plannedAtLast}%`}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{m.actualProgress === null ? "—" : `${m.actualProgress}%`}</td>
                      <td style={{ ...td, color: varColor(m.progressVar), fontWeight: 700 }}>{signed(m.progressVar)}</td>
                      <td style={td}>{m.status ? <StatusBadge theme={theme} status={m.status} /> : <span style={{ color: theme.textFaint }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint }}>
              * Man-days compare reported days only, so a partly reported month isn't counted as a shortfall. Actual averages use planned working days that were reported.
            </div>
          </div>
        )}
      </Card>

      {planOpen && <PlanEditorModal theme={theme} project={project} plan={plan} onClose={() => setPlanOpen(false)} onSave={(p) => { onSavePlan(p); setPlanOpen(false); }} />}
    </div>
  );
}

/* =========================================================================
   ADD PROJECT — now also collects the planned schedule & resources
   ========================================================================= */
/* =========================================================================
   DATA ENTRY — one place to enter everything for a chosen date:
   daily report, activity progress, costs, safety incidents, and bulk paste from Excel/CSV.
   ========================================================================= */
function validateDailyEntry(g, plan, actuals, today) {
  if (!isValidISO(g.date)) return { error: "Choose a valid date." };
  if (g.date > today) return { error: "Future dates can't be reported." };
  if (g.date < plan.startDate) return { error: `This date is before the planned start (${fmtDMY(plan.startDate)}).` };
  const w = Number(g.workers), m = Number(g.machines);
  if (g.workers === "" || !Number.isInteger(w) || w < 0) return { error: "Enter actual workers as a whole number (0 or more)." };
  if (g.machines === "" || !Number.isInteger(m) || m < 0) return { error: "Enter actual machines as a whole number (0 or more)." };
  let progress = null;
  if (g.progress !== "") {
    const p = Number(g.progress);
    if (isNaN(p) || p < 0 || p > 100) return { error: "Cumulative progress must be between 0 and 100." };
    progress = p;
    const others = actuals.filter(e => e.progress !== null && e.progress !== undefined && e.date !== g.date);
    const before = others.filter(e => e.date < g.date).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    const after = others.filter(e => e.date > g.date).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
    if (before && p < before.progress) return { error: `Cumulative progress can't be lower than ${before.progress}% reported on ${fmtDMY(before.date)}.` };
    if (after && p > after.progress) return { error: `Cumulative progress can't be higher than ${after.progress}% reported on ${fmtDMY(after.date)}.` };
  }
  let hoursLost = 0;
  if (g.hoursLost !== "") { hoursLost = Number(g.hoursLost); if (isNaN(hoursLost) || hoursLost < 0 || hoursLost > 24) return { error: "Hours lost must be between 0 and 24." }; }
  return { entry: { id: g.date, date: g.date, workers: w, machines: m, progress, reason: g.reason || "", remarks: String(g.remarks || "").trim(), weather: g.weather || "", hoursLost, ...(g.photo ? { photo: g.photo } : {}), savedAt: new Date().toISOString() } };
}

// dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy or yyyy-mm-dd -> ISO, or null
function parseEntryDate(s) {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { const [yy, mm, dd] = t.split("-").map(Number); return mm >= 1 && mm <= 12 && dd >= 1 && dd <= new Date(yy, mm, 0).getDate() && isValidISO(t) ? t : null; }
  const m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > new Date(yy, mm, 0).getDate()) return null;
  const iso = `${m[3]}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return isValidISO(iso) ? iso : null;
}
function splitRow(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim());
}
const BULK_COLS = ["date", "workers", "machines", "progress", "reason", "weather", "hoursLost", "remarks"];
function parseBulkText(text) {
  const lines = String(text || "").split(/\r?\n/).filter(l => l.trim() !== "").slice(0, 401);
  if (!lines.length) return [];
  const head = lines[0];
  const delim = head.includes("\t") ? "\t" : head.split(";").length > head.split(",").length ? ";" : ",";
  let start = 0, map = BULK_COLS.map((_, i) => i);
  const first = splitRow(head, delim);
  if (!parseEntryDate(first[0])) {
    start = 1;
    const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");
    const alias = { date: "date", workers: "workers", actualworkers: "workers", machines: "machines", actualmachines: "machines", progress: "progress", cumulativeprogress: "progress", reason: "reason", delayreason: "reason", weather: "weather", hourslost: "hoursLost", workinghourslost: "hoursLost", remarks: "remarks", notes: "remarks" };
    const idx = {};
    first.forEach((h, i) => { const k = alias[norm(h)]; if (k && idx[k] === undefined) idx[k] = i; });
    map = BULK_COLS.map(c => (idx[c] === undefined ? -1 : idx[c]));
  }
  return lines.slice(start).map((l, i) => {
    const cells = splitRow(l, delim), raw = {};
    BULK_COLS.forEach((c, j) => { raw[c] = map[j] >= 0 && cells[map[j]] !== undefined ? cells[map[j]] : ""; });
    return { line: start + i + 1, raw };
  });
}
const normChoice = (v, list) => { const t = String(v || "").trim(); if (!t) return ""; return list.find(x => x.toLowerCase() === t.toLowerCase()) || "Other"; };
const entryDraftKey = (pid, date) => `infratrack-entry-draft-${pid}-${date}`;

/* ---- voice entry: speak the day's report, check it, save it for the selected date ---- */
const VOICE_LABELS = { workers: "Workers", machines: "Machines", progress: "Progress %", hoursLost: "Hours lost", weather: "Weather", reason: "Delay reason", remarks: "Remarks" };
function VoiceEntry({ theme, date, onFill, onSave }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [msg, setMsg] = useState("");
  const recRef = useRef(null);
  const baseRef = useRef("");
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const parsed = useMemo(() => parseVoiceEntry(text), [text]);
  useEffect(() => () => { try { recRef.current && recRef.current.abort(); } catch (e) { /* ignore */ } }, []);
  useEffect(() => { setText(""); setMsg(""); }, [date]);

  const start = () => {
    if (!SR) { setMsg("This browser has no voice recognition. Use Chrome, Edge or Safari, or type the report in the box below."); return; }
    setMsg("");
    try {
      const rec = new SR();
      rec.lang = lang; rec.continuous = true; rec.interimResults = true;
      baseRef.current = text ? text.trim() + " " : "";
      rec.onresult = (ev) => {
        let t = "";
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript + " ";
        setText((baseRef.current + t).trim());
      };
      rec.onerror = (ev) => {
        const e = ev && ev.error;
        setMsg(e === "not-allowed" || e === "service-not-allowed" ? "Microphone is blocked. Allow the microphone for this site in the browser, then try again."
          : e === "no-speech" ? "Nothing was heard. Tap the mic and speak again."
          : e === "network" ? "Voice recognition needs an internet connection."
          : e === "aborted" ? "" : "Voice input stopped (" + (e || "unknown") + "). You can type instead.");
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec; rec.start(); setListening(true);
    } catch (e) { setListening(false); setMsg("Could not start the microphone. You can type the report instead."); }
  };
  const stop = () => { try { recRef.current && recRef.current.stop(); } catch (e) { /* ignore */ } setListening(false); };
  const hasAny = parsed.found.length > 0;
  const chipVal = (k) => parsed.fields[k] === undefined ? "" : (k === "progress" ? parsed.fields[k] + "%" : String(parsed.fields[k]));

  return (
    <Card theme={theme} style={{ marginBottom: 12 }}>
      <SectionTitle theme={theme} title="Voice entry" sub={`Speak the day's report. It is saved for ${fmtDMY(date)}, the date selected above.`}
        right={<select aria-label="Voice language" value={lang} onChange={e => setLang(e.target.value)} disabled={listening} style={{ ...trkInput(theme), width: "auto", padding: "6px 8px", fontSize: 12.5 }}>
          <option value="en-IN">English / Hinglish</option><option value="hi-IN">हिन्दी</option></select>} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <Button theme={theme} icon={Mic} kind={listening ? "danger" : "primary"} onClick={listening ? stop : start}>{listening ? "Stop listening" : "Tap and speak"}</Button>
        {listening && <span role="status" style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 700 }}>● Listening…</span>}
      </div>
      <textarea aria-label="Voice transcript" rows={2} style={{ ...trkInput(theme), resize: "vertical", fontFamily: FONT_UI }} className="bs-input-focus"
        placeholder='Example: "45 workers, 6 machines, progress 32 percent, weather clear, 2 hours lost, remarks slab casting done"'
        value={text} onChange={e => setText(e.target.value)} />
      {msg && <div role="alert" style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{msg}</div>}
      {text.trim() && (
        <div style={{ marginTop: 10 }}>
          {hasAny ? (
            <div data-testid="voice-parsed" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {parsed.found.map(k => <span key={k} style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, border: `1px solid ${theme.border}`, color: theme.text }}>{VOICE_LABELS[k]}: {chipVal(k)}</span>)}
            </div>
          ) : <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted }}>Nothing recognised yet. Say numbers with words like workers, machines, progress percent.</div>}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button theme={theme} icon={Send} disabled={!hasAny} onClick={() => { const r = onSave(parsed.fields); if (r && r.ok) { setText(""); setMsg(""); } else if (r && r.error) setMsg(r.error); }}>Save for {fmtDMY(date)}</Button>
            <Button theme={theme} kind="ghost" disabled={!hasAny} onClick={() => { onFill(parsed.fields); setMsg(""); }}>Only fill the form</Button>
            <Button theme={theme} kind="subtle" onClick={() => { setText(""); setMsg(""); }}>Clear text</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DataEntryPage({ theme, project, summary, trackerLoaded, setView, pushToast, entryFocus, onSaveActual, onDeleteActual, onSaveActualsBulk, onLogActivitiesBulk, onDeleteLog, onAddCost, onDeleteCost, onAddIncident, onDeleteIncident }) {
  const isMobile = useIsMobile();
  const trk = summary.trk, plan = trk.plan, a = summary.tr;
  const actuals = trk.actuals || [];
  const today = todayISO();
  const inputStyle = trkInput(theme), labelStyle = trkLabel(theme);
  const blank = (d) => ({ date: d, workers: "", machines: "", progress: "", reason: "", remarks: "", weather: "", hoursLost: "", photo: null });

  const [date, setDate] = useState(today);
  const [tab, setTab] = useState("daily");
  const [f, setF] = useState(() => blank(today));
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [qty, setQty] = useState({});
  const [qnotes, setQnotes] = useState({});
  const [actError, setActError] = useState("");
  const [cf, setCf] = useState({ category: COST_CATEGORIES[0], amount: "", activityId: "", contractor: "", note: "" });
  const [costError, setCostError] = useState("");
  const [sf, setSf] = useState({ type: INCIDENT_TYPES[0], severity: INCIDENT_SEVERITY[0], contractor: "", description: "" });
  const [safeError, setSafeError] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [confirmDate, setConfirmDate] = useState(null);

  const existing = actuals.find(e => e.date === date) || null;
  const hint = a ? a.plannedFor(isValidISO(date) ? date : today) : null;
  const prevReport = useMemo(() => [...actuals].filter(e => e.date < date).sort((x, y) => (x.date < y.date ? 1 : -1))[0] || null, [actuals, date]);
  const missingDays = useMemo(() => {
    if (!a || !plan) return [];
    const out = [], from = plan.startDate > addDays(today, -30) ? plan.startDate : addDays(today, -30);
    for (let d = today; d >= from; d = addDays(d, -1)) if (a.plannedFor(d).working && !actuals.some(e => e.date === d)) out.push(d);
    return out;
  }, [a, plan, actuals, today]);
  const actRows = summary.act ? summary.act.rows : [];
  const logsOnDate = trk.actLogs.filter(l => l.date === date);
  const costsOnDate = trk.costs.filter(c => c.date === date);
  const incOnDate = trk.incidents.filter(i => i.date === date);
  const contractorNames = [...new Set([...trk.activities.map(x => x.contractor), ...trk.costs.map(x => x.contractor), ...trk.incidents.map(x => x.contractor)].filter(Boolean))];

  // the project changed, or another page asked to open a specific day
  useEffect(() => { setDate(today); setTab("daily"); setBulkText(""); setBulkMsg(""); }, [project.id]);
  useEffect(() => { if (entryFocus && entryFocus.date && isValidISO(entryFocus.date)) { setDate(entryFocus.date); setTab("daily"); } }, [entryFocus && entryFocus.n]);

  // load the saved report for this day, else an unsaved draft, else a blank form
  useEffect(() => {
    setError("");
    if (existing) {
      setF({ date, workers: String(existing.workers), machines: String(existing.machines), progress: existing.progress === null || existing.progress === undefined ? "" : String(existing.progress), reason: existing.reason || "", remarks: existing.remarks || "", weather: existing.weather || "", hoursLost: existing.hoursLost ? String(existing.hoursLost) : "", photo: existing.photo || null });
      setEditing(true); setNote("Showing the saved report for this day. Saving again replaces it.");
      return;
    }
    setEditing(false);
    let d = null;
    try { const raw = window.localStorage.getItem(entryDraftKey(project.id, date)); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
    if (d && typeof d === "object") { setF({ ...blank(date), ...d, date, photo: null }); setNote("Unsaved draft restored."); }
    else { setF(blank(date)); setNote(""); }
    setQty({}); setQnotes({}); setActError("");
  }, [date, project.id, !!existing]);
  useEffect(() => { setQty({}); setQnotes({}); setActError(""); setCostError(""); setSafeError(""); }, [date, project.id]);

  // keep what you typed, so a refresh or a phone call does not lose it
  useEffect(() => {
    if (editing || !plan) return;
    const any = f.workers !== "" || f.machines !== "" || f.progress !== "" || f.reason || f.remarks || f.weather || f.hoursLost !== "";
    try {
      const k = entryDraftKey(project.id, f.date);
      if (any) window.localStorage.setItem(k, JSON.stringify({ workers: f.workers, machines: f.machines, progress: f.progress, reason: f.reason, remarks: f.remarks, weather: f.weather, hoursLost: f.hoursLost }));
      else window.localStorage.removeItem(k);
    } catch (e) { /* storage unavailable: no draft */ }
  }, [f, editing]);

  const setField = (k, v) => { setF(x => ({ ...x, [k]: v })); if (error) setError(""); };
  const bump = (k, n) => setField(k, String(Math.max(0, (Number(f[k]) || 0) + n)));
  const shiftDay = (n) => { const d = addDays(date, n); if (d <= today && isValidISO(d)) setDate(d); };
  const goDay = (d) => { setDate(d); setTab("daily"); };

  const submitDaily = (goNext) => {
    setError("");
    const r = validateDailyEntry(f, plan, actuals, today);
    if (r.error) return setError(r.error);
    onSaveActual(r.entry, !!existing);
    try { window.localStorage.removeItem(entryDraftKey(project.id, f.date)); } catch (e) { /* ignore */ }
    if (goNext) { const nxt = missingDays.filter(d => d !== f.date)[0]; if (nxt) setDate(nxt); }
  };
  const applyPhotoCount = (res, autoSave) => {
    const base = { ...f, workers: String(res.workers), machines: String(res.machines), photo: res.meta };
    if (existing) {
      if (base.progress === "" && existing.progress !== null && existing.progress !== undefined) base.progress = String(existing.progress);
      if (!base.weather && existing.weather) base.weather = existing.weather;
      if (!base.reason && existing.reason) base.reason = existing.reason;
      if (!base.remarks && existing.remarks) base.remarks = existing.remarks;
      if (base.hoursLost === "" && existing.hoursLost) base.hoursLost = String(existing.hoursLost);
    }
    setF(base); setError("");
    if (!autoSave) return { saved: false };
    if (res.confidence === "low") return { saved: false, lowConfidence: true };
    const r = validateDailyEntry(base, plan, actuals, today);
    if (r.error) return { saved: false, error: r.error };
    onSaveActual(r.entry, !!existing);
    return { saved: true };
  };
  const voiceMerge = (vf) => {
    const o = { ...f, date };
    if (vf.workers !== undefined) o.workers = String(vf.workers);
    if (vf.machines !== undefined) o.machines = String(vf.machines);
    if (vf.progress !== undefined) o.progress = String(vf.progress);
    if (vf.hoursLost !== undefined) o.hoursLost = String(vf.hoursLost);
    if (vf.weather) o.weather = vf.weather;
    if (vf.reason) o.reason = vf.reason;
    if (vf.remarks) o.remarks = vf.remarks;
    return o;
  };
  const voiceFill = (vf) => { setF(voiceMerge(vf)); setError(""); };
  const voiceSave = (vf) => {
    const o = voiceMerge(vf);
    const r = validateDailyEntry(o, plan, actuals, today);
    if (r.error) { setF(o); return { ok: false, error: r.error + " The spoken values are in the form below, fix them there." }; }
    onSaveActual(r.entry, !!existing);
    try { window.localStorage.removeItem(entryDraftKey(project.id, date)); } catch (e) { /* ignore */ }
    return { ok: true };
  };
  const usePlanned = () => { if (hint && hint.working) setF(x => ({ ...x, workers: String(hint.workers), machines: String(hint.machines) })); };
  const copyLast = () => { if (prevReport) setF(x => ({ ...x, workers: String(prevReport.workers), machines: String(prevReport.machines), weather: prevReport.weather || x.weather })); };

  const submitActivities = () => {
    if (date > today) return setActError("Future dates can't be logged.");
    const logs = [];
    for (const r of actRows) {
      const raw = qty[r.id];
      if (raw === undefined || raw === "") continue;
      const q = Number(raw);
      if (isNaN(q) || q <= 0) return setActError(`${r.name}: quantity must be above 0.`);
      const left = Math.max(0, r.plannedQty - r.done);
      if (q > left + 1e-9) return setActError(`${r.name}: only ${round2(left)} ${r.unit} is left of the planned quantity. Edit the activity's planned quantity first if the scope grew.`);
      logs.push({ id: newId("l"), activityId: r.id, date, qty: q, note: String(qnotes[r.id] || "").trim() });
    }
    if (!logs.length) return setActError("Enter a quantity for at least one activity.");
    onLogActivitiesBulk(logs);
    setQty({}); setQnotes({}); setActError("");
  };
  const submitCost = () => {
    if (date > today) return setCostError("Future dates can't be booked.");
    const amt = Number(cf.amount);
    if (cf.amount === "" || isNaN(amt) || amt <= 0) return setCostError("Amount must be above 0 (in ₹).");
    onAddCost({ id: newId("c"), date, category: cf.category, amount: amt, activityId: cf.activityId, contractor: cf.contractor.trim(), note: cf.note.trim() });
    setCf(x => ({ ...x, amount: "", note: "" })); setCostError("");
  };
  const submitIncident = () => {
    if (date > today) return setSafeError("Future dates can't be logged.");
    if (!sf.description.trim()) return setSafeError("Describe what happened.");
    onAddIncident({ id: newId("i"), date, type: sf.type, severity: sf.severity, contractor: sf.contractor.trim(), description: sf.description.trim(), status: "Open" });
    setSf(x => ({ ...x, description: "" })); setSafeError("");
  };

  const bulk = useMemo(() => {
    if (!plan || !bulkText.trim()) return null;
    const parsed = parseBulkText(bulkText);
    let pool = actuals.slice();
    const seen = new Map(), rows = [];
    for (const p of parsed) {
      const iso = parseEntryDate(p.raw.date);
      const g = { date: iso || p.raw.date, workers: p.raw.workers, machines: p.raw.machines, progress: String(p.raw.progress).replace(/%/g, "").trim(), reason: normChoice(p.raw.reason, DELAY_REASONS), weather: normChoice(p.raw.weather, WEATHER_OPTIONS), remarks: p.raw.remarks, hoursLost: p.raw.hoursLost };
      if (!iso) { rows.push({ line: p.line, g, error: `Date "${p.raw.date}" is not valid (use DD/MM/YYYY or YYYY-MM-DD).` }); continue; }
      if (seen.has(iso)) { rows.push({ line: p.line, g, error: `Same date as line ${seen.get(iso)}.` }); continue; }
      const r = validateDailyEntry(g, plan, pool, today);
      if (r.error) { rows.push({ line: p.line, g, error: r.error }); continue; }
      seen.set(iso, p.line);
      rows.push({ line: p.line, g, entry: r.entry, replaces: actuals.some(e => e.date === iso) });
      pool = pool.filter(e => e.date !== iso).concat(r.entry);
    }
    return { rows, ok: rows.filter(r => r.entry), bad: rows.filter(r => r.error) };
  }, [bulkText, plan, actuals, today]);
  const downloadTemplate = () => {
    const y = addDays(today, -1);
    const csv = ["date,workers,machines,progress,reason,weather,hoursLost,remarks", `${y},96,11,18.5,,Clear,0,Slab pour on level 3`, `${today},92,10,19.2,Weather,Light rain,3,Rain after lunch`].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "daily-reports-template.csv");
  };
  const readFile = (file) => {
    if (!file) return;
    if (file.size > 1000000) { setBulkMsg("That file is too large. Paste up to 400 rows."); return; }
    const rd = new FileReader();
    rd.onload = () => { setBulkText(String(rd.result || "")); setBulkMsg(""); };
    rd.readAsText(file);
  };
  const doBulkImport = () => {
    if (!bulk || !bulk.ok.length) return;
    onSaveActualsBulk(bulk.ok.map(r => r.entry));
    setBulkText(""); setBulkMsg(`Imported ${bulk.ok.length} report${bulk.ok.length === 1 ? "" : "s"}.`);
  };

  const th = thStyle(theme), td = tdStyle(theme);
  const cols = (n) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${n}, 1fr)`, gap: 12 });
  const stepBtn = { width: 34, flexShrink: 0, borderRadius: 3, border: `1px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: FONT_MONO };
  const chip = (label, count, ok, target) => (
    <button key={label} onClick={() => setTab(target)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: ok ? theme.green : theme.textMuted, background: ok ? theme.greenSoft : theme.panelAlt, border: `1px solid ${ok ? theme.green + "55" : theme.border}` }}>
      {ok ? <CircleCheck size={13} /> : <CircleAlert size={13} />} {label}{count !== null ? ` · ${count}` : ""}
    </button>
  );
  const tabs = [["daily", "Daily report"], ["activity", "Activity progress"], ["cost", "Cost"], ["safety", "Safety incident"], ["bulk", "Paste from Excel"]];

  const hero = (
    <PageHero theme={theme} icon={ClipboardList} title="Data Entry"
      subtitle={`${project.name} — enter site data for any day in one place`}
      tickerItems={[`Entry date ${fmtDMY(date)}`, plan ? `${missingDays.length} planned working day${missingDays.length === 1 ? "" : "s"} without a report in the last 30 days` : "Add the plan first to start daily reports", `${actuals.length} daily report${actuals.length === 1 ? "" : "s"} · ${trk.actLogs.length} activity log${trk.actLogs.length === 1 ? "" : "s"} · ${trk.costs.length} cost entr${trk.costs.length === 1 ? "y" : "ies"}`]} />
  );
  if (!trackerLoaded) return <div>{hero}<Card theme={theme}><div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Loading saved data…</div></Card></div>;

  const needPlan = (what) => (
    <EmptyState theme={theme} icon={CalendarDays} title="Add the project plan first"
      text={`${what} needs the plan (dates, workers and machines per day) so every entry can be checked and compared. It takes a minute.`}
      action={<Button theme={theme} icon={Plus} onClick={() => setView("planactual")}>Add planned data</Button>} />
  );

  return (
    <div>
      {hero}
      {confirmDate && (
        <Modal theme={theme} title="Delete this report?" onClose={() => setConfirmDate(null)} width={420}>
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>The daily report for {fmtDMY(confirmDate)} will be removed. Activity logs, costs and incidents for that day are not affected.</div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Button theme={theme} kind="danger" icon={Trash2} onClick={() => { onDeleteActual(confirmDate); setConfirmDate(null); }}>Delete report</Button>
            <Button theme={theme} kind="subtle" onClick={() => setConfirmDate(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* ---- date + what is done for that day ---- */}
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={labelStyle}>Entry date</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <IconBtn theme={theme} icon={ChevronLeft} title="Previous day" onClick={() => shiftDay(-1)} />
              <input type="date" max={today} value={date} className="bs-input-focus" style={{ ...inputStyle, width: 160 }}
                onChange={e => { const v = e.target.value; if (isValidISO(v) && v <= today) setDate(v); }} />
              <IconBtn theme={theme} icon={ChevronRight} title="Next day" onClick={() => shiftDay(1)} />
              <Button theme={theme} small kind="ghost" onClick={() => setDate(today)}>Today</Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chip("Daily report", null, !!existing, "daily")}
            {chip("Activity logs", logsOnDate.length, logsOnDate.length > 0, "activity")}
            {chip("Costs", costsOnDate.length, costsOnDate.length > 0, "cost")}
            {chip("Incidents", incOnDate.length, incOnDate.length > 0, "safety")}
          </div>
        </div>
        {missingDays.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.borderSoft}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, fontWeight: 700 }}>NO REPORT YET</span>
            {missingDays.slice(0, 10).map(d => (
              <button key={d} onClick={() => goDay(d)} style={{ fontFamily: FONT_MONO, fontSize: 12, cursor: "pointer", color: d === date ? theme.onAccent : theme.text, background: d === date ? theme.accent : theme.panelAlt, border: `1px solid ${d === date ? theme.accent : theme.border}`, borderRadius: 999, padding: "3px 10px" }}>{fmtShort(d)}</button>
            ))}
            {missingDays.length > 10 && <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint }}>+{missingDays.length - 10} more</span>}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map(([k, l]) => <Button key={k} theme={theme} small kind={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>{l}</Button>)}
      </div>

      {/* ================= DAILY REPORT ================= */}
      {tab === "daily" && (!plan || !a ? needPlan("Daily reporting") : (
        <>
          <VoiceEntry theme={theme} date={date} onFill={voiceFill} onSave={voiceSave} />
          <Card theme={theme} style={{ marginBottom: 12 }}>
            <SectionTitle theme={theme} title={editing ? `Report for ${fmtDMY(date)}` : `New report for ${fmtDMY(date)}`}
              sub="Workers, machines and the cumulative progress % reached by the end of the day."
              right={<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button theme={theme} small kind="ghost" onClick={usePlanned}>Use planned numbers</Button>
                {prevReport && <Button theme={theme} small kind="ghost" onClick={copyLast}>Copy {fmtShort(prevReport.date)}</Button>}
              </div>} />
            {note && <div style={{ marginBottom: 12, fontFamily: FONT_UI, fontSize: 12.5, color: theme.accent, fontWeight: 600 }}>{note}</div>}
            <div style={cols(3)}>
              <div><label style={labelStyle}>Actual workers on site *</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={stepBtn} onClick={() => bump("workers", -1)}>−</button>
                  <input type="number" min="0" inputMode="numeric" style={inputStyle} className="bs-input-focus" placeholder={hint && hint.working ? `Plan ${hint.workers}` : "e.g. 96"} value={f.workers} onChange={e => setField("workers", e.target.value)} />
                  <button type="button" style={stepBtn} onClick={() => bump("workers", 1)}>+</button>
                </div></div>
              <div><label style={labelStyle}>Actual machines working *</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={stepBtn} onClick={() => bump("machines", -1)}>−</button>
                  <input type="number" min="0" inputMode="numeric" style={inputStyle} className="bs-input-focus" placeholder={hint && hint.working ? `Plan ${hint.machines}` : "e.g. 11"} value={f.machines} onChange={e => setField("machines", e.target.value)} />
                  <button type="button" style={stepBtn} onClick={() => bump("machines", 1)}>+</button>
                </div></div>
              <div><label style={labelStyle}>Cumulative progress % (to date)</label>
                <input type="number" min="0" max="100" step="0.1" inputMode="decimal" style={inputStyle} className="bs-input-focus" placeholder={hint ? `Plan ${hint.cum}%` : "e.g. 18.5"} value={f.progress} onChange={e => setField("progress", e.target.value)} /></div>
            </div>
            <div style={{ ...cols(3), marginTop: 12 }}>
              <div><label style={labelStyle}>Delay reason (if any)</label>
                <select style={inputStyle} className="bs-input-focus" value={f.reason} onChange={e => setField("reason", e.target.value)}>
                  <option value="">None</option>{DELAY_REASONS.map(r => <option key={r}>{r}</option>)}
                </select></div>
              <div><label style={labelStyle}>Weather</label>
                <select style={inputStyle} className="bs-input-focus" value={f.weather} onChange={e => setField("weather", e.target.value)}>
                  <option value="">Not noted</option>{WEATHER_OPTIONS.map(w => <option key={w}>{w}</option>)}
                </select></div>
              <div><label style={labelStyle}>Working hours lost</label>
                <input type="number" min="0" max="24" step="0.5" inputMode="decimal" style={inputStyle} className="bs-input-focus" placeholder="e.g. 3" value={f.hoursLost} onChange={e => setField("hoursLost", e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={labelStyle}>Remarks</label>
              <input style={inputStyle} className="bs-input-focus" placeholder="Optional notes for the day" value={f.remarks} onChange={e => setField("remarks", e.target.value)} /></div>
            {!editing && <SitePhotoCounter theme={theme} date={f.date} onCounted={applyPhotoCount} />}
            <div style={{ marginTop: 10, fontFamily: FONT_MONO, fontSize: 11.5, color: theme.textMuted, lineHeight: 1.6 }}>
              {!hint.inRange ? `Plan for ${fmtDMY(date)}: outside the planned date range.`
                : !hint.working ? `Plan for ${fmtDMY(date)}: not a planned working day. Work reported here counts as extra and is left out of the resource comparison.`
                : `Plan for ${fmtDMY(date)}: ${hint.workers} workers · ${hint.machines} machines · ${hint.cum}% cumulative progress`}
              {prevReport && prevReport.progress !== null && prevReport.progress !== undefined ? ` · last reported ${prevReport.progress}% on ${fmtShort(prevReport.date)}` : ""}
            </div>
            {error && <div role="alert" style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{error}</div>}
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button theme={theme} icon={Send} onClick={() => submitDaily(false)}>{editing ? "Update report" : "Save report"}</Button>
              {missingDays.filter(d => d !== date).length > 0 && <Button theme={theme} kind="subtle" icon={ArrowRight} onClick={() => submitDaily(true)}>Save and open next missing day</Button>}
              {editing && <Button theme={theme} kind="danger" icon={Trash2} onClick={() => setConfirmDate(date)}>Delete this report</Button>}
            </div>
          </Card>

          <Card theme={theme}>
            <SectionTitle theme={theme} title="Latest reports" sub="Click a row to open that day." right={<Button theme={theme} small kind="ghost" onClick={() => setView("planactual")}>See comparison</Button>} />
            {actuals.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No daily reports yet.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Date", "Workers", "Machines", "Progress", "Reason", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...actuals].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 7).map(r => (
                      <tr key={r.date} className="bs-row" onClick={() => goDay(r.date)} style={{ borderBottom: `1px solid ${theme.borderSoft}`, background: r.date === date ? theme.panelAlt : "transparent" }}>
                        <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{fmtDMY(r.date)}</td>
                        <td style={td}>{r.workers}</td><td style={td}>{r.machines}</td>
                        <td style={td}>{r.progress === null || r.progress === undefined ? "—" : `${r.progress}%`}</td>
                        <td style={{ ...td, fontFamily: FONT_UI, color: theme.textMuted }}>{r.reason || "—"}</td>
                        <td style={td} onClick={e => e.stopPropagation()}><IconBtn theme={theme} icon={Trash2} title="Delete report" onClick={() => setConfirmDate(r.date)} /></td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </Card>
        </>
      ))}

      {/* ================= ACTIVITY PROGRESS ================= */}
      {tab === "activity" && (actRows.length === 0 ? (
        <EmptyState theme={theme} icon={ListChecks} title="No activities yet"
          text="Add the work items (excavation, concrete, piling…) with their planned quantity and dates. Then you can log quantity done for each one, here, every day."
          action={<Button theme={theme} icon={Plus} onClick={() => setView("activities")}>Add activities</Button>} />
      ) : (
        <Card theme={theme}>
          <SectionTitle theme={theme} title={`Quantity done on ${fmtDMY(date)}`} sub="Fill only the activities that worked that day, then save them all together." />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Activity", "Done / planned", "Left", "Already logged today", "Quantity done today", "Note"].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {actRows.map(r => {
                  const left = Math.max(0, r.plannedQty - r.done);
                  const today1 = logsOnDate.filter(l => l.activityId === r.id).reduce((s, l) => s + l.qty, 0);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                      <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}<div style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.textFaint, fontWeight: 500 }}>{r.actualPct}% actual · {r.plannedPct}% planned</div></td>
                      <td style={td}>{round2(r.done)} / {r.plannedQty} {r.unit}</td>
                      <td style={td}>{round2(left)} {r.unit}</td>
                      <td style={td}>{today1 > 0 ? `${round2(today1)} ${r.unit}` : "—"}</td>
                      <td style={td}><div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="number" min="0" inputMode="decimal" style={{ ...inputStyle, width: 110 }} className="bs-input-focus" value={qty[r.id] === undefined ? "" : qty[r.id]} onChange={e => { setQty(x => ({ ...x, [r.id]: e.target.value })); setActError(""); }} />
                        <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: theme.textFaint }}>{r.unit}</span></div></td>
                      <td style={td}><input style={{ ...inputStyle, width: 170 }} className="bs-input-focus" placeholder="Optional" value={qnotes[r.id] || ""} onChange={e => setQnotes(x => ({ ...x, [r.id]: e.target.value }))} /></td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
          {actError && <div role="alert" style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{actError}</div>}
          <div style={{ marginTop: 14 }}><Button theme={theme} icon={Check} onClick={submitActivities}>Save activity progress</Button></div>
          {logsOnDate.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.borderSoft}` }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>LOGGED ON {fmtDMY(date).toUpperCase()}</div>
              {logsOnDate.map(l => { const row = actRows.find(x => x.id === l.activityId); return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontFamily: FONT_UI, fontSize: 13, color: theme.text }}>
                  <span style={{ flex: 1 }}><b>{row ? row.name : "Activity"}</b> · {round2(l.qty)} {row ? row.unit : ""}{l.note ? ` · ${l.note}` : ""}</span>
                  <IconBtn theme={theme} icon={Trash2} title="Delete this log" onClick={() => onDeleteLog(l.id)} />
                </div>); })}
            </div>)}
        </Card>
      ))}

      {/* ================= COST ================= */}
      {tab === "cost" && (
        <Card theme={theme}>
          <SectionTitle theme={theme} title={`Cost booked on ${fmtDMY(date)}`} sub="Amounts are in ₹. Each entry feeds budget vs actual, earned value and the forecast final cost." />
          <div style={cols(4)}>
            <Field theme={theme} label="Category"><select style={inputStyle} className="bs-input-focus" value={cf.category} onChange={e => setCf(x => ({ ...x, category: e.target.value }))}>{COST_CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field theme={theme} label="Amount ₹ *"><input type="number" min="0" inputMode="decimal" style={inputStyle} className="bs-input-focus" placeholder="e.g. 250000" value={cf.amount} onChange={e => { setCf(x => ({ ...x, amount: e.target.value })); setCostError(""); }} /></Field>
            <Field theme={theme} label="Activity (optional)"><select style={inputStyle} className="bs-input-focus" value={cf.activityId} onChange={e => setCf(x => ({ ...x, activityId: e.target.value }))}><option value="">Not linked</option>{trk.activities.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field theme={theme} label="Contractor (optional)"><input list="de-contractors" style={inputStyle} className="bs-input-focus" value={cf.contractor} onChange={e => setCf(x => ({ ...x, contractor: e.target.value }))} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Field theme={theme} label="Note (optional)"><input style={inputStyle} className="bs-input-focus" placeholder="Invoice no., supplier…" value={cf.note} onChange={e => setCf(x => ({ ...x, note: e.target.value }))} /></Field></div>
          {costError && <div role="alert" style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{costError}</div>}
          <div style={{ marginTop: 14 }}><Button theme={theme} icon={Plus} onClick={submitCost}>Add cost</Button></div>
          {costsOnDate.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.borderSoft}` }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>BOOKED ON {fmtDMY(date).toUpperCase()}</div>
              {costsOnDate.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontFamily: FONT_UI, fontSize: 13, color: theme.text }}>
                  <span style={{ flex: 1 }}><b>{fmtMoney(c.amount)}</b> · {c.category}{c.contractor ? ` · ${c.contractor}` : ""}{c.note ? ` · ${c.note}` : ""}</span>
                  <IconBtn theme={theme} icon={Trash2} title="Delete this cost" onClick={() => onDeleteCost(c.id)} />
                </div>))}
            </div>)}
        </Card>
      )}

      {/* ================= SAFETY ================= */}
      {tab === "safety" && (
        <Card theme={theme}>
          <SectionTitle theme={theme} title={`Incident on ${fmtDMY(date)}`} sub="Log near misses and incidents as they happen. Open ones stay on the Safety page until you close them." />
          <div style={cols(3)}>
            <Field theme={theme} label="Type"><select style={inputStyle} className="bs-input-focus" value={sf.type} onChange={e => setSf(x => ({ ...x, type: e.target.value }))}>{INCIDENT_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field theme={theme} label="Severity"><select style={inputStyle} className="bs-input-focus" value={sf.severity} onChange={e => setSf(x => ({ ...x, severity: e.target.value }))}>{INCIDENT_SEVERITY.map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field theme={theme} label="Contractor (optional)"><input list="de-contractors" style={inputStyle} className="bs-input-focus" value={sf.contractor} onChange={e => setSf(x => ({ ...x, contractor: e.target.value }))} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Field theme={theme} label="What happened *"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} className="bs-input-focus" placeholder="Where, who was involved, what was done" value={sf.description} onChange={e => { setSf(x => ({ ...x, description: e.target.value })); setSafeError(""); }} /></Field></div>
          {safeError && <div role="alert" style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{safeError}</div>}
          <div style={{ marginTop: 14 }}><Button theme={theme} icon={Plus} onClick={submitIncident}>Log incident</Button></div>
          {incOnDate.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.borderSoft}` }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>LOGGED ON {fmtDMY(date).toUpperCase()}</div>
              {incOnDate.map(i => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontFamily: FONT_UI, fontSize: 13, color: theme.text }}>
                  <span style={{ flex: 1 }}><b>{i.type}</b> · {i.severity} · {i.status}{i.contractor ? ` · ${i.contractor}` : ""} — {i.description}</span>
                  <IconBtn theme={theme} icon={Trash2} title="Delete this incident" onClick={() => onDeleteIncident(i.id)} />
                </div>))}
            </div>)}
        </Card>
      )}
      <datalist id="de-contractors">{contractorNames.map(n => <option key={n} value={n} />)}</datalist>

      {/* ================= BULK ================= */}
      {tab === "bulk" && (!plan || !a ? needPlan("Importing daily reports") : (
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Paste many daily reports at once"
            sub="Copy the cells from Excel or Google Sheets and paste them here, or load a CSV file. Columns: date, workers, machines, progress %, reason, weather, hours lost, remarks. The first row may be a heading."
            right={<Button theme={theme} small kind="ghost" icon={Download} onClick={downloadTemplate}>Template CSV</Button>} />
          <textarea rows={7} value={bulkText} onChange={e => { setBulkText(e.target.value); setBulkMsg(""); }} className="bs-input-focus"
            placeholder={"date\tworkers\tmachines\tprogress\n25/10/2026\t96\t11\t18.5"} style={{ ...inputStyle, fontFamily: FONT_MONO, fontSize: 12, resize: "vertical" }} />
          <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="bs-btn" style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12.5, borderRadius: 3, padding: "6px 10px", cursor: "pointer", background: "transparent", color: theme.text, border: `1px solid ${theme.border}`, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Upload size={13} /> Load CSV file
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" style={{ display: "none" }} onChange={e => { readFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            </label>
            {bulkText && <Button theme={theme} small kind="ghost" onClick={() => { setBulkText(""); setBulkMsg(""); }}>Clear</Button>}
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint }}>Dates: DD/MM/YYYY or YYYY-MM-DD. Up to 400 rows. A date that already has a report is replaced.</span>
          </div>
          {bulkMsg && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.green, fontWeight: 700 }}>{bulkMsg}</div>}
          {bulk && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, fontWeight: 700, marginBottom: 8 }}>
                {bulk.ok.length} ready to import{bulk.bad.length ? ` · ${bulk.bad.length} with problems (these will be skipped)` : ""}
              </div>
              <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto", border: `1px solid ${theme.borderSoft}`, borderRadius: 3 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Line", "Date", "Workers", "Machines", "Progress", "Result"].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {bulk.rows.map(r => (
                      <tr key={r.line} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                        <td style={td}>{r.line}</td>
                        <td style={td}>{isValidISO(r.g.date) ? fmtDMY(r.g.date) : r.g.date || "—"}</td>
                        <td style={td}>{r.g.workers || "—"}</td><td style={td}>{r.g.machines || "—"}</td><td style={td}>{r.g.progress ? `${r.g.progress}%` : "—"}</td>
                        <td style={{ ...td, fontFamily: FONT_UI, whiteSpace: "normal", color: r.error ? theme.red : theme.green, fontWeight: 600 }}>{r.error ? r.error : r.replaces ? "OK, replaces the saved report" : "OK"}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 14 }}>
                <Button theme={theme} icon={Check} onClick={doBulkImport} style={{ opacity: bulk.ok.length ? 1 : 0.5 }}>{bulk.ok.length ? `Import ${bulk.ok.length} report${bulk.ok.length === 1 ? "" : "s"}` : "Nothing to import"}</Button>
              </div>
            </div>)}
        </Card>
      ))}
    </div>
  );
}


function AboutPage({ theme }) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(siteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { window.prompt("Copy this link:", siteUrl); }
  };
  const updated = new Date(process.env.NEXT_PUBLIC_BUILT_AT || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const points = [
    ["Plan vs actual", "Enter the project plan once, report the site every day, and see exactly where the work is ahead or behind."],
    ["Data Entry", "Daily reports, activity progress, cost, safety incidents and Excel/CSV paste in one place."],
    ["Delay and forecast", "Delay detection from the difference between plan and actual, plus a predicted completion date."],
    ["Cost, safety, contractors", "Budget vs actual, incident log, and contractor performance on the same data."],
    ["Reports and backup", "Daily progress reports, PDF/Excel project reports, audit trail, and cloud sync to your own account."],
  ];
  return (
    <div>
      <PageHero theme={theme} icon={Info} title="About InfraTrack" subtitle="Connecting plans to reality" />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr", gap: 12 }}>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="About the website" sub="A site-progress tracker for construction and infrastructure projects."
            right={<Button theme={theme} small kind="ghost" icon={copied ? Check : Copy} onClick={copyLink}>{copied ? "Link copied" : "Copy site link"}</Button>} />
          <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: theme.text, lineHeight: 1.7 }}>
            InfraTrack helps a project team compare what was planned with what actually happened on site, day by day, so delays are noticed early instead of at the end of the month.
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {points.map(([t, d]) => (
              <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <CircleCheck size={16} color={theme.green} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, lineHeight: 1.55 }}><b style={{ color: theme.text }}>{t}.</b> {d}</div>
              </div>))}
          </div>
        </Card>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Developer" sub="The person who built this website." />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: theme.accent, color: theme.onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_UI, fontWeight: 800, fontSize: 20, flexShrink: 0 }}>SP</div>
            <div>
              <div style={{ fontFamily: FONT_UI, fontSize: 17, fontWeight: 800, color: theme.text }}>Shikhar Pratap Singh</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted }}>Website developer</div>
            </div>
          </div>
          <div style={{ marginTop: 18, fontFamily: FONT_MONO, fontSize: 11.5, color: theme.textFaint }}>Last updated {updated}</div>
        </Card>
      </div>
    </div>
  );
}

function AddProjectModal({ theme, onClose, onSave, onLoadDemo, onLoadAyodhya, onLoadSultanganj }) {
  const [form, setForm] = useState({
    name: "", client: "", contractor: "", pm: "", startDate: "", endDate: "", forecast: "", value: "",
    perWeek: "6", workers: "", machines: "", budget: "", overrides: {},
  });
  const [error, setError] = useState("");
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (error) setError(""); };
  const setOverride = (key, field, v) => {
    setForm(f => ({ ...f, overrides: { ...f.overrides, [key]: { ...(f.overrides[key] || {}), [field]: v } } }));
    if (error) setError("");
  };
  const inputStyle = trkInput(theme);
  const labelStyle = trkLabel(theme);
  const textFields = [
    ["name", "Project Name", "e.g. Pune Ring Road · Pkg 04", true],
    ["client", "Client", "e.g. NHAI", true],
    ["contractor", "Contractor", "e.g. ABC Infrastructure", false],
    ["pm", "Project Manager", "e.g. Aarav Mehta", false],
    ["forecast", "Forecast Completion (optional)", "Leave blank — the tracker calculates it from actual data", false],
    ["value", "Contract Value", "e.g. ₹620 Cr", false],
  ];
  const submit = () => {
    if (!form.name.trim() || !form.client.trim()) { setError("Project Name and Client are required."); return; }
    const hasPlanInput = form.workers !== "" || form.machines !== "";
    let plan = null;
    if (hasPlanInput) {
      const r = resolvePlan(form);
      if (r.error) { setError(r.error); return; }
      plan = r.plan;
    } else if (form.startDate && form.endDate && form.endDate <= form.startDate) {
      setError("Planned Completion Date must be after the Start Date."); return;
    }
    onSave({
      name: form.name, client: form.client, contractor: form.contractor, pm: form.pm, forecast: form.forecast, value: form.value,
      start: form.startDate ? fmtDMY(form.startDate) : "", planned: form.endDate ? fmtDMY(form.endDate) : "",
    }, plan);
  };
  const sectionTitle = (t, sub) => (
    <div style={{ margin: "18px 0 10px", paddingTop: 14, borderTop: `1px solid ${theme.borderSoft}` }}>
      <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13.5, color: theme.text }}>{t}</div>
      {sub && <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <Modal theme={theme} title="Add New Project" onClose={onClose} width={780}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {textFields.map(([key, label, placeholder, required]) => (
          <div key={key} style={key === "name" ? { gridColumn: "1 / -1" } : undefined}>
            <label style={labelStyle}>{label}{required && <span style={{ color: theme.red }}> *</span>}</label>
            <input style={inputStyle} className="bs-input-focus" placeholder={placeholder} value={form[key]} onChange={e => set(key, e.target.value)} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>Start Date</label>
          <input type="date" style={inputStyle} className="bs-input-focus" value={form.startDate} onChange={e => set("startDate", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Planned Completion Date</label>
          <input type="date" style={inputStyle} className="bs-input-focus" value={form.endDate} onChange={e => set("endDate", e.target.value)} />
        </div>
      </div>

      {sectionTitle("Planned resources (used for delay detection)",
        "Enter how many workers and machines you plan per day. Later, actual site data is compared with this. Leave workers and machines blank to skip — you can add the plan any time from the Planned vs Actual Tracker.")}
      <PlanFields theme={theme} form={form} set={set} setOverride={setOverride} />

      {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <Button theme={theme} icon={Check} onClick={submit}>Save Project</Button>
        <Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button>
        {onLoadDemo && <Button theme={theme} kind="ghost" icon={Sparkles} onClick={() => onLoadDemo()}>Load demo project instead</Button>}
        {onLoadAyodhya && <Button theme={theme} kind="ghost" icon={Sparkles} onClick={() => onLoadAyodhya()}>Load Northern Ayodhya Bypass demo</Button>}
        {onLoadSultanganj && <Button theme={theme} kind="ghost" icon={Sparkles} onClick={() => onLoadSultanganj()}>Load Aguwani–Sultanganj Bridge demo</Button>}
      </div>
    </Modal>
  );
}

/* =========================================================================
   REAL-DATA ENGINE
   Everything below is computed from what the user entered for the selected
   project: plan, daily reports, activities + progress logs, costs, safety
   incidents. Nothing is simulated. When a number can't be computed from the
   entered data, the functions return null and the UI shows "—" / a prompt.
   ========================================================================= */
const ACTIVITY_UNITS = ["m³", "m²", "m", "km", "nos", "tonnes", "kg", "bags", "% (lump sum)"];
const COST_CATEGORIES = ["Labour", "Materials", "Machinery / Equipment", "Subcontractor", "Transport", "Overheads", "Other"];
const WEATHER_OPTIONS = ["Clear", "Cloudy", "Light rain", "Heavy rain", "Heat wave", "Fog", "Strong wind", "Other"];
const INCIDENT_TYPES = ["Near miss", "First aid", "Medical treatment", "Lost-time injury", "Property / equipment damage", "Environmental", "Other"];
const INCIDENT_SEVERITY = ["Minor", "Major", "Critical"];
const SEV_RANK = { Critical: 0, High: 1, Medium: 2 };
const round2 = (v) => Math.round(v * 100) / 100;
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${round2(a / 1e7)} Cr`;
  if (a >= 1e5) return `${s}₹${round2(a / 1e5)} L`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}
function normTrk(t) {
  const x = t || {};
  return {
    plan: x.plan || null, actuals: x.actuals || [], activities: x.activities || [],
    actLogs: x.actLogs || [], costs: x.costs || [], incidents: x.incidents || [],
  };
}

/* =========================================================================
   DEMO PROJECT — a complete sample project with EVERY section filled in
   (details, monthly plan, daily reports with weather / hours lost / photo
   counts, activities + progress logs, costs, safety incidents) so you can
   see how the whole app behaves. All dates are relative to today, so the
   project is always "in progress". Numbers are deterministic sample data.
   ========================================================================= */

/* ---- Northern Ayodhya Bypass demo (facts from the NHAI case-study PDF; every daily figure is SIMULATED) ----
   Real, reported facts: NHAI; Ceigall India Ltd / SPV Ceigall Northern Ayodhya Bypass Pvt Ltd; 35.40 km (Part 1 30.40 km north of
   NH-27, km 112+540 to 139+928; Part 2 5.00 km south, km 0+000 to 5+000); HAM; bid project cost Rs 1,199.30 crore; LOA 23 Sep 2024;
   appointed date 9 Jul 2025; 912 days construction period. Quantities, labour, machinery, costs, delays and incidents below are
   made up to demonstrate the app and are labelled "simulated". */
const DEMO_AYODHYA = {
  seed: 20271,
  startDate: "2025-07-09",
  durationDays: 912,
  MAIN: "Ceigall Northern Ayodhya Bypass Pvt Ltd",
  planBudget: "11993000000", planWorkers: "420", planMachines: "60",
  ramp: (i, n) => { const t = n > 1 ? i / (n - 1) : 0, b = Math.sin(Math.PI * Math.min(1, t * 1.04)); return [Math.round(110 + 540 * b), Math.round(16 + 84 * b)]; },
  lag: 26, lagRamp: 240,
  photoNote: "Simulated sample photo count for the demo project.",
  REMARKS: [
    "Embankment layer compaction in Part 1; field density test passed.", "Pile boring running at major bridge foundation; QC cleared.",
    "Culvert barrel casting in Part 2; curing in progress.", "Haulage from borrow area steady on two shifts.",
    "Survey team re-marked centre line near the NH-27 crossing.", "Cement and reinforcement steel received; lab samples sent.",
    "Joint inspection with the Authority Engineer completed.", "Safety toolbox talk held at 8:00 AM.",
    "Subgrade preparation on the completed embankment stretch.", "Dewatering running at pier foundation.",
    "Cross-drainage works progressing on Part 1.", "Utility shifting coordination meeting with the local office.",
  ],
  OTHER_LOSS: [
    ["Machine breakdown", "Excavator hydraulic hose burst; replaced by evening.", 3],
    ["Material shortage", "Aggregate delayed at the crusher; trucks arrived late.", 4],
    ["Labour shortage", "Part of the gang absent for a local festival.", 2],
    ["Design / drawing change", "Revised drawing awaited for a culvert skew angle.", 3],
    ["Land / site access", "Local access dispute on Part 1; work paused at that front.", 5],
  ],
  chain: (between) => {
    const fmtKm = (km, part) => { const k = Math.floor(km), m = Math.round((km - k) * 10) * 100; return m >= 1000 ? `${k + 1}+000` : `${k}+${String(m).padStart(3, "0")}`; };
    if (between(0, 1) < 0.15) { const a = between(0, 4.4); return `Part 2 · km ${fmtKm(a)} to ${fmtKm(a + 0.5)}`; }
    const a = 112.54 + between(0, 26.8);
    return `Part 1 · NH-27 km ${fmtKm(a)} to ${fmtKm(a + 0.5)}`;
  },
  // [name, unit, planned qty, start day, end day, contractor, budget (Rs), progress factor]
  ACTS: [
    ["Mobilisation, survey & site clearing", "ha", 190, 0, 75, "Ceigall Northern Ayodhya Bypass Pvt Ltd", 280000000, 1.0],
    ["Utility shifting & land-front clearance", "km", 35.4, 20, 330, "Ceigall Northern Ayodhya Bypass Pvt Ltd", 450000000, 0.85],
    ["Earthwork - embankment", "m³", 5600000, 45, 560, "Sub-contractor 1 (earthwork)", 1900000000, 0.92],
    ["Culverts (box & pipe)", "nos", 118, 60, 520, "Sub-contractor 2 (structures)", 750000000, 0.95],
    ["Minor bridges & underpasses", "nos", 22, 90, 640, "Sub-contractor 2 (structures)", 1250000000, 0.88],
    ["Major bridges", "nos", 5, 70, 760, "Sub-contractor 2 (structures)", 1850000000, 0.82],
    ["Drainage & protection works", "m", 31000, 150, 700, "Sub-contractor 1 (earthwork)", 700000000, 0.93],
    ["Subgrade & granular sub-base", "m³", 640000, 300, 700, "Sub-contractor 3 (pavement)", 1000000000, 0.9],
    ["Wet mix macadam base", "m³", 300000, 400, 760, "Sub-contractor 3 (pavement)", 650000000, 1.0],
    ["Bituminous layers (DBM + BC)", "km", 35.4, 560, 860, "Sub-contractor 3 (pavement)", 1900000000, 1.0],
    ["Road furniture, signage & crash barriers", "km", 35.4, 700, 890, "Ceigall Northern Ayodhya Bypass Pvt Ltd", 450000000, 1.0],
    ["Toll plaza, buildings & lighting", "nos", 6, 640, 900, "Ceigall Northern Ayodhya Bypass Pvt Ltd", 500000000, 1.0],
  ],
  INC: [
    [14, "Near miss", "Minor", "Ceigall Northern Ayodhya Bypass Pvt Ltd", "Truck reversed near the haul-road crossing; banksman posted afterwards.", "Closed"],
    [41, "First aid", "Minor", "Sub-contractor 1 (earthwork)", "Worker cut a finger on rebar; first aid given on site.", "Closed"],
    [77, "Property / equipment damage", "Major", "Sub-contractor 2 (structures)", "Piling rig tilted on soft ground; no injury, platform re-compacted.", "Closed"],
    [118, "Near miss", "Major", "Sub-contractor 1 (earthwork)", "Excavator swung close to a walkway; exclusion zone enforced.", "Closed"],
    [164, "Environmental", "Minor", "Ceigall Northern Ayodhya Bypass Pvt Ltd", "Minor oil leak from a DG set; contained and cleaned.", "Closed"],
    [213, "Medical treatment", "Major", "Sub-contractor 3 (pavement)", "Worker treated for heat stress and discharged.", "Closed"],
    [262, "Near miss", "Minor", "Sub-contractor 2 (structures)", "Formwork prop slipped during shuttering; area was barricaded.", "Closed"],
    [331, "Lost-time injury", "Major", "Sub-contractor 2 (structures)", "Worker twisted an ankle on uneven ground; 2 days off work.", "Closed"],
    [402, "Near miss", "Minor", "Sub-contractor 1 (earthwork)", "Cable strike during trenching; the line was already isolated.", "Open"],
    [447, "Property / equipment damage", "Minor", "Sub-contractor 3 (pavement)", "Roller clipped a temporary barricade; replaced.", "Open"],
  ],
  project: (startDate, endDate, forecast) => ({
    name: "Northern Ayodhya Bypass · HAM (Simulated demo data)", client: "NHAI · NHDP Phase-VII · 35.40 km · daily figures simulated",
    contractor: "Ceigall Northern Ayodhya Bypass Pvt Ltd (SPV of Ceigall India Ltd)", pm: "Project Manager (demo)",
    start: fmtDMY(startDate), planned: fmtDMY(endDate), forecast, value: "₹1,199.30 Cr (bid project cost)",
  }),
};
/* ---- Aguwani-Sultanganj Ganga Bridge demo (facts from the uploaded case-study report; every daily figure is SIMULATED) ----
   Real, reported facts (media-based, per the case study): Aguwani (Khagaria) to Sultanganj (Bhagalpur), Bihar, over the Ganga;
   construction agency S.P. Singla Constructions Pvt. Ltd.; reported project cost about Rs 1,710.8 crore; sections collapsed on
   30 Apr 2022 and 4 Jun 2023. The report gives NO schedule, quantities, labour, machinery, costs or site logs, so all of those below
   are made up to show how InfraTrack would monitor such a project. Dates are relative to today. The simulated timeline does not
   reproduce the real collapse dates, and nothing here states a cause or assigns responsibility. */
function makeDemoSultanganj() {
  const MAIN = "S.P. Singla Constructions Pvt. Ltd.";
  const S1 = "Sub-contractor 1 (piling & foundations)", S2 = "Sub-contractor 2 (precast segments)", S3 = "Sub-contractor 3 (erection & launching)";
  return {
    seed: 20230604,
    startDate: addDays(todayISO(), -300),
    durationDays: 720,
    MAIN,
    planBudget: "17108000000", planWorkers: "380", planMachines: "48",
    ramp: (i, n) => { const t = n > 1 ? i / (n - 1) : 0, b = Math.sin(Math.PI * Math.min(1, t * 1.04)); return [Math.round(90 + 300 * b), Math.round(12 + 40 * b)]; },
    lag: 24, lagRamp: 200,
    photoNote: "Simulated sample photo count for the demo project.",
    REMARKS: [
      "Bored pile concreting at river pier; tremie pour completed, cubes sent to lab.", "Pier shaft shuttering and rebar tying in progress.",
      "Precast segments cast at the yard; match-cast faces inspected and logged.", "Segment joint surfaces cleaned and checked against the approved procedure.",
      "Launching gantry alignment survey completed.", "Barge-mounted crane moved material to the river pier.",
      "Cement and strand lots received; test certificates filed.", "Third-party quality audit visit; observations recorded.",
      "Safety toolbox talk held at 8:00 AM.", "Prestressing jack calibration verified before stressing.",
      "Approach embankment layer compaction test passed.", "Joint inspection with the supervision consultant completed.",
    ],
    OTHER_LOSS: [
      ["Machine breakdown", "Barge crane hydraulic fault; repaired by evening.", 3],
      ["Material shortage", "Strand delivery delayed; stressing rescheduled.", 4],
      ["Labour shortage", "Part of the casting-yard gang absent for a local festival.", 2],
      ["Design / drawing change", "Revised joint detail drawing awaited before the next segment lift.", 3],
      ["Client / approval hold", "Independent expert review of segment joint details pending; erection paused.", 5],
      ["Land / site access", "Approach road access blocked at the yard gate; deliveries rerouted.", 2],
    ],
    chain: (between) => { const a = Math.max(1, Math.round(between(1, 60))); return `Pier P${a} to P${a + 1}`; },
    // [name, unit, planned qty, start day, end day, contractor, budget (Rs), progress factor]
    ACTS: [
      ["Mobilisation, survey & soil investigation", "ha", 42, 0, 60, MAIN, 500000000, 1.0],
      ["Casting yard & batching plant setup", "nos", 2, 20, 110, MAIN, 800000000, 1.0],
      ["Bored pile foundations", "nos", 380, 45, 330, S1, 2400000000, 0.95],
      ["Pile caps & pier shafts", "nos", 62, 120, 400, S1, 2600000000, 0.9],
      ["Pier caps & bearings", "nos", 62, 220, 470, S2, 1500000000, 0.88],
      ["Precast segment casting (match-cast)", "nos", 2400, 150, 620, S2, 3000000000, 0.92],
      ["Segment erection & joints", "spans", 60, 260, 640, S3, 2400000000, 0.78],
      ["Wet-stitch joints & prestressing", "joints", 120, 330, 680, S3, 1500000000, 1.0],
      ["Approach embankment & viaduct", "m³", 900000, 90, 520, S1, 1400000000, 0.85],
      ["Wearing coat, expansion joints & crash barriers", "spans", 62, 560, 700, MAIN, 700000000, 1.0],
      ["Quality testing, NDT & third-party audits", "nos", 400, 60, 700, MAIN, 300000000, 1.0],
    ],
    INC: [
      [12, "Near miss", "Minor", MAIN, "Barge mooring line parted during material transfer; no injury.", "Closed"],
      [38, "First aid", "Minor", S1, "Worker cut a hand on a rebar cage; first aid given on site.", "Closed"],
      [71, "Property / equipment damage", "Major", S1, "Piling rig tilted on a soft river-bed platform; no injury, platform re-compacted.", "Closed"],
      [104, "Environmental", "Minor", MAIN, "Bentonite slurry spill near the river edge; contained and cleaned.", "Closed"],
      [142, "Near miss", "Major", S2, "Formwork prop slipped during pier shaft shuttering; area was barricaded.", "Closed"],
      [188, "Medical treatment", "Major", S1, "Worker treated for heat stress and discharged.", "Closed"],
      [231, "Near miss", "Critical", S2, "Hairline crack noticed at a precast segment joint during inspection; erection paused for independent expert review.", "Open"],
      [263, "Property / equipment damage", "Major", S3, "Launching gantry alignment deviation found at a span check; re-surveyed before the next lift.", "Open"],
      [289, "Near miss", "Minor", S3, "Temporary support sensor reading crossed the alert limit; load reduced and logged.", "Open"],
    ],
    project: (startDate, endDate, forecast) => ({
      name: "Aguwani–Sultanganj Ganga Bridge · Bihar (Case-study demo, simulated data)",
      client: "Bihar · Ganga River, Aguwani (Khagaria) – Sultanganj (Bhagalpur) · daily figures simulated",
      contractor: "S.P. Singla Constructions Pvt. Ltd.", pm: "Project Manager (demo)",
      start: fmtDMY(startDate), planned: fmtDMY(endDate), forecast, value: "₹1,710.8 Cr (reported project cost)",
    }),
  };
}
function buildDemoProject(C = {}) {
  const today = todayISO();
  const startDate = C.startDate || addDays(today, -75);
  const endDate = C.durationDays ? addDays(startDate, C.durationDays) : addDays(today, 165);
  const perWeek = 6;
  let seed = C.seed || 20260;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const between = (a, b) => a + (b - a) * r();
  const half = (v) => Math.round(v * 2) / 2;
  const pickOf = (arr) => arr[Math.floor(r() * arr.length)];
  const MAIN = C.MAIN || "Mahalaxmi Infra Projects Ltd";

  /* ---- 1. plan: gentle S-curve targets + month-wise worker / machine ramp ---- */
  const keys = monthsInRange(startDate, endDate);
  const wd = keys.map(k => workingDaysInMonthWithinPlan(k, startDate, endDate, perWeek));
  const totalWd = wd.reduce((s, v) => s + v, 0);
  const RW = C.ramp ? keys.map((k, i) => C.ramp(i, keys.length)[0]) : [95, 120, 135, 140, 140, 135, 120, 100, 80, 60];
  const RM = C.ramp ? keys.map((k, i) => C.ramp(i, keys.length)[1]) : [12, 16, 20, 22, 22, 20, 16, 12, 8, 6];
  const overrides = {};
  let cw = 0;
  keys.forEach((k, i) => {
    cw += wd[i];
    const t = cw / totalWd;
    overrides[k] = { workers: String(RW[i] !== undefined ? RW[i] : 80), machines: String(RM[i] !== undefined ? RM[i] : 8), cum: String(round1(100 * (0.7 * t + 0.3 * t * t * (3 - 2 * t)))) };
  });
  const res = resolvePlan({ startDate, endDate, perWeek: "6", workers: C.planWorkers || "120", machines: C.planMachines || "18", budget: C.planBudget || "480000000", overrides });
  if (res.error) return null;
  const plan = res.plan;
  const curve = buildCurve(plan);
  const cumAt = (iso) => (iso < plan.startDate ? 0 : iso >= plan.endDate ? 100 : curve[diffDays(plan.startDate, iso)].cum);
  const monthOf = (iso) => plan.months.find(m => m.key === monthKey(iso)) || plan.months[0];

  /* ---- 2. daily reports: one per working day, up to today ---- */
  const REMARKS = C.REMARKS || [
    "PCC and formwork continued at Ch. 12+400; QC cleared.", "Compaction trials passed on embankment layer.", "Rebar tying for pier cap P3 completed.",
    "Culvert barrel cast; curing in progress.", "Hauling from borrow area running smoothly.", "Survey team re-marked centre line near km 14.",
    "Subcontractor gang added for drain lining.", "Material received: 420 t cement, 85 t steel.", "Concrete cube samples sent to site lab.",
    "Safety toolbox talk held at 8:00 AM.", "Dewatering pumps running at pier foundation.", "Joint inspection with client engineer completed.",
  ];
  const WEATHER_PICK = [["Clear", 0.45], ["Cloudy", 0.25], ["Light rain", 0.12], ["Heavy rain", 0.06], ["Heat wave", 0.04], ["Fog", 0.04], ["Strong wind", 0.04]];
  const pickWeather = () => { let x = r(), acc = 0; for (const [w, p] of WEATHER_PICK) { acc += p; if (x <= acc) return w; } return "Clear"; };
  const OTHER_LOSS = C.OTHER_LOSS || [
    ["Machine breakdown", "Excavator hydraulic hose burst; replaced by evening.", 3],
    ["Material shortage", "GSB aggregate delayed at crusher; trucks arrived late.", 4],
    ["Labour shortage", "Part of the gang absent for a local festival.", 2],
    ["Design / drawing change", "Revised drawing awaited for culvert skew angle.", 3],
    ["Land / site access", "Farmer access dispute near Ch. 9+100; work paused.", 5],
  ];
  const actuals = [];
  let lastProg = 0, idx = 0;
  const lagFor = (n) => Math.round((C.lag || 9) * Math.min(1, n / (C.lagRamp || 70)));
  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    if (!isWorkingDay(d, perWeek)) continue;
    const n = diffDays(startDate, d);
    const m = monthOf(d);
    const recent = diffDays(d, today) <= 14;
    const weather = pickWeather();
    let hoursLost = 0, reason = "", remarks = REMARKS[idx % REMARKS.length];
    if (weather === "Heavy rain") { hoursLost = half(between(4, 8)); reason = "Weather"; remarks = "Heavy rain — earthwork stopped, only drainage crews worked."; }
    else if (weather === "Light rain") { hoursLost = half(between(1, 2)); reason = "Weather"; remarks = "Intermittent showers; concreting shifted to afternoon."; }
    else if (weather === "Fog") { hoursLost = 1; reason = "Weather"; remarks = "Dense fog until 9:30 AM; late start for hauling."; }
    else if (weather === "Strong wind") { hoursLost = 2; reason = "Weather"; remarks = "Crane lifts suspended due to wind."; }
    else if (weather === "Heat wave") { hoursLost = 1.5; reason = "Weather"; remarks = "Afternoon break extended for heat; water points doubled."; }
    else if (r() < 0.1) { const o = pickOf(OTHER_LOSS); reason = o[0]; remarks = o[1]; hoursLost = o[2]; }
    const lossFactor = hoursLost >= 4 ? 0.8 : 1;
    const workers = Math.max(1, Math.round(m.workers * between(0.8, 1.0) * (recent ? 0.92 : 1) * lossFactor));
    const machines = Math.max(1, Math.round(m.machines * between(0.75, 1.0) * lossFactor));
    const prog = Math.max(lastProg, round1(cumAt(addDays(d, -lagFor(n)))));
    lastProg = prog;
    const e = { id: d, date: d, workers, machines, progress: prog, reason, remarks, weather, hoursLost };
    if (idx % 12 === 5) {
      const ex = Math.round(machines * 0.4); let tr = Math.round(machines * 0.4); let ro = machines - ex - tr;
      if (ro < 0) { tr += ro; ro = 0; }
      const machineTypes = [{ type: "excavator", count: ex }, { type: "truck", count: tr }, { type: "roller", count: ro }].filter(x => x.count > 0);
      e.photo = { source: "photo", engine: ENGINE_FULL, workers, machines, machineTypes, confidence: idx % 24 === 5 ? "high" : "medium", photos: 2, notes: C.photoNote || "Sample photo count for the demo project.", at: new Date().toISOString() };
    }
    e.savedAt = new Date().toISOString();
    actuals.push(e);
    idx++;
  }
  const tr = analyzeTracker(plan, actuals, today);
  const latestProgress = lastProg;

  /* ---- 3. activities + progress logs ---- */
  const off = (n) => addDays(startDate, n);
  const todayOff = diffDays(startDate, today);
  const ACTS = C.ACTS || [
    ["Site clearing & grubbing", "m²", 250000, 0, 30, "Shree Earthmovers Pvt Ltd", 18000000, 1.0],
    ["Earthwork excavation", "m³", 180000, 10, 120, "Shree Earthmovers Pvt Ltd", 85000000, 0.78],
    ["Embankment filling", "m³", 140000, 40, 150, "Shree Earthmovers Pvt Ltd", 72000000, 0.9],
    ["Box & pipe culverts", "nos", 14, 15, 110, "Navyug Drainage & Roads", 46000000, 1.0],
    ["Bridge piers & foundations", "nos", 8, 25, 170, "Kaveri Bridge Works", 120000000, 0.7],
    ["Subgrade preparation", "m²", 96000, 70, 190, "Bharat Infra Constructions", 30000000, 1.1],
    ["GSB layer", "m³", 38000, 95, 200, "Bharat Infra Constructions", 42000000, 1.0],
    ["Drainage & retaining walls", "m", 6500, 20, 140, "Navyug Drainage & Roads", 37000000, 1.04],
  ];
  const LOG_NOTES = ["QC passed, no rework.", "Slow start, soil moisture high.", "Good output with extra shift.", "Compaction test OK (98% MDD).", "Delayed by truck shortage in the afternoon.", "Inspection cleared by client engineer.", "Ahead of daily target.", "Equipment shared with another front."];
  let aN = 0, lN = 0;
  const activities = [], actLogs = [];
  ACTS.forEach(([name, unit, plannedQty, s, e, contractor, budget, factor]) => {
    aN++;
    const a = { id: `ademo${aN}`, name, unit, plannedQty, start: off(s), end: off(e), contractor, budget };
    activities.push(a);
    if (s > todayOff) return;
    const frac = actPlannedPct(a, today) / 100;
    const done = factor >= 1 && e < todayOff ? plannedQty : Math.min(plannedQty - 1, Math.max(1, Math.round(plannedQty * Math.min(0.97, frac * factor))));
    const last = e < todayOff ? off(e) : today;
    const cands = [];
    for (let d = a.start; d <= last; d = addDays(d, 1)) if (isWorkingDay(d, perWeek) && r() < 0.6) cands.push(d);
    if (!cands.length) cands.push(a.start);
    let days = cands.slice(0, Math.max(1, Math.min(cands.length, Math.floor(done))));
    const w = days.map(() => between(0.6, 1.4)), sw = w.reduce((x, y) => x + y, 0);
    const q = w.map(x => Math.max(1, Math.round(done * x / sw)));
    let diff = done - q.reduce((x, y) => x + y, 0), k = 0, guard = 0;
    while (diff !== 0 && guard++ < 100000) {
      const i = k++ % q.length;
      if (diff > 0) { q[i] += 1; diff -= 1; } else if (q[i] > 1) { q[i] -= 1; diff += 1; }
    }
    days.forEach((d, i) => {
      const c0 = 1 + Math.round(between(0, 20)), c1 = c0 + 1 + Math.round(between(0, 3));
      lN++;
      actLogs.push({ id: `ldemo${lN}`, activityId: a.id, date: d, qty: q[i], note: `${C.chain ? C.chain(between) : `Ch. ${c0}+${String(Math.round(between(0, 9)) * 100).padStart(3, "0")} to ${c1}+${String(Math.round(between(0, 9)) * 100).padStart(3, "0")}`} — ${LOG_NOTES[(lN + i) % LOG_NOTES.length]}` });
    });
  });

  /* ---- 4. costs: a little above earned value so the cost alerts show ---- */
  const EV = plan.budget * latestProgress / 100;
  const AC = Math.round(EV * 1.09 / 1000) * 1000;
  const CATS = [["Labour", 0.24, 6], ["Materials", 0.34, 7], ["Machinery / Equipment", 0.22, 6], ["Subcontractor", 0.10, 3], ["Transport", 0.05, 3], ["Overheads", 0.04, 3], ["Other", 0.01, 1]];
  const started = activities.filter(a => a.start <= today);
  const wts = started.map(a => { const done = actLogs.filter(l => l.activityId === a.id).reduce((s, l) => s + l.qty, 0); return Math.max(0.02, a.budget * done / a.plannedQty); });
  const pickAct = () => { const tot = wts.reduce((x, y) => x + y, 0); let x = r() * tot; for (let i = 0; i < started.length; i++) { x -= wts[i]; if (x <= 0) return started[i]; } return started[0]; };
  const NOTES = {
    "Labour": ["Fortnightly wages — skilled & unskilled", "Overtime payment for night pour", "Wages incl. PF/ESI contribution"],
    "Materials": ["Cement & steel purchase", "Aggregate and sand supply", "Bitumen / admixtures", "Pipes for culverts", "Formwork material"],
    "Machinery / Equipment": ["Excavator & roller hire", "Diesel for site fleet", "Crane rental for pier caps", "Batching plant running cost"],
    "Subcontractor": ["Running bill — drainage lining", "Piling subcontractor stage payment"],
    "Transport": ["Hauling from borrow area", "Material transport to site"],
    "Overheads": ["Site office & camp running cost", "Insurance & statutory fees", "Staff salaries & utilities"],
    "Other": ["Miscellaneous site expenses"],
  };
  const costs = [];
  let cN = 0;
  CATS.forEach(([cat, share, cnt]) => {
    const unlinked = cat === "Labour" || cat === "Overheads" || cat === "Other";
    for (let i = 0; i < cnt; i++) {
      const dayOff = Math.min(todayOff - 1, 4 + Math.round(((i + between(0.1, 0.9)) / cnt) * (todayOff - 6)));
      const act = unlinked ? null : pickAct();
      cN++;
      costs.push({ id: `cdemo${cN}`, date: off(Math.max(0, dayOff)), category: cat, amount: AC * share / cnt * between(0.75, 1.25), activityId: act ? act.id : "", contractor: act ? act.contractor : MAIN, note: NOTES[cat][i % NOTES[cat].length] });
    }
  });
  const rawTotal = costs.reduce((s, c) => s + c.amount, 0);
  costs.forEach(c => { c.amount = Math.round(c.amount * AC / rawTotal / 1000) * 1000; });
  costs[costs.length - 1].amount += AC - costs.reduce((s, c) => s + c.amount, 0);
  costs.sort((a, b) => (a.date < b.date ? -1 : 1));

  /* ---- 5. safety incidents ---- */
  const INC = C.INC || [
    [3, "Near miss", "Minor", "Shree Earthmovers Pvt Ltd", "Dumper reversed without banksman; stopped in time.", "Closed"],
    [12, "First aid", "Minor", "Navyug Drainage & Roads", "Worker cut finger on rebar; first aid given on site.", "Closed"],
    [26, "Property / equipment damage", "Major", "Kaveri Bridge Works", "Crane outrigger sank in soft soil; no injury, repairs done.", "Closed"],
    [38, "Near miss", "Major", "Bharat Infra Constructions", "Unsecured shuttering fell from height; area was barricaded.", "Closed"],
    [49, "Environmental", "Minor", MAIN, "Small diesel spill near fuel bowser; soil removed and treated.", "Closed"],
    [58, "Medical treatment", "Major", "Shree Earthmovers Pvt Ltd", "Operator treated at hospital for heat exhaustion.", "Open"],
    [64, "Lost-time injury", "Major", "Kaveri Bridge Works", "Worker slipped on wet scaffold plank; 3 days off work.", "Closed"],
    [70, "Near miss", "Minor", "Navyug Drainage & Roads", "Trench edge collapsed after rain; workers were out.", "Open"],
    [73, "Property / equipment damage", "Minor", "Bharat Infra Constructions", "Roller clipped a temporary barricade; replaced.", "Open"],
  ];
  const incidents = INC.map(([o, type, severity, contractor, description, status], i) => ({ id: `idemo${i + 1}`, date: off(o), type, severity, contractor, description, status }));

  return {
    project: {
      id: `p${Date.now()}`,
      ...(C.project ? C.project(startDate, endDate, tr.forecastEnd ? fmtDMY(tr.forecastEnd) : "—") : {
        name: "Pune Ring Road · Pkg 04 (Demo)", client: "NHAI", contractor: MAIN, pm: "Aarav Mehta",
        start: fmtDMY(startDate), planned: fmtDMY(endDate), forecast: tr.forecastEnd ? fmtDMY(tr.forecastEnd) : "—", value: "₹620 Cr",
      }),
    },
    tracker: { plan, actuals, activities, actLogs, costs, incidents },
  };
}

/* ---- activities ---- */
function actPlannedPct(a, iso) {
  if (iso < a.start) return 0;
  if (iso >= a.end) return 100;
  const n = diffDays(a.start, a.end) + 1;
  return ((diffDays(a.start, iso) + 1) / n) * 100;
}
function analyzeActivities(acts, logs, costs, today) {
  const rows = acts.map(a => {
    const my = logs.filter(l => l.activityId === a.id).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    const done = my.reduce((s, l) => s + l.qty, 0);
    const actualPct = a.plannedQty > 0 ? Math.min(100, round1((done / a.plannedQty) * 100)) : 0;
    const plannedPct = round1(actPlannedPct(a, today));
    const variance = round1(actualPct - plannedPct);
    const complete = a.plannedQty > 0 && done >= a.plannedQty;
    const notStarted = !complete && today < a.start && done === 0;
    const overdue = !complete && today > a.end;
    let status;
    if (complete) status = "Completed";
    else if (notStarted) status = "Not started";
    else if (overdue) status = variance <= -2 ? "Delayed" : "At Risk";
    else status = statusFromVariance(variance);

    let delayDays = 0;
    if (!complete && !notStarted && actualPct < plannedPct - 0.05) {
      const n = diffDays(a.start, a.end) + 1;
      const k = Math.max(-1, Math.ceil((actualPct / 100) * n) - 1);
      delayDays = Math.max(0, diffDays(addDays(a.start, k), today));
    }
    const lastLog = my.length ? my[my.length - 1].date : null;
    let forecastEnd = null, projectedDelay = null;
    if (complete) { forecastEnd = lastLog; projectedDelay = lastLog ? diffDays(a.end, lastLog) : null; }
    else if (done > 0 && today >= a.start) {
      const rate = done / (diffDays(a.start, today) + 1);
      if (rate > 0) {
        forecastEnd = addDays(today, Math.ceil((a.plannedQty - done) / rate));
        projectedDelay = diffDays(a.end, forecastEnd);
      }
    }
    const inWindow = !complete && today >= a.start;
    const idleDays = inWindow ? (lastLog ? diffDays(lastLog, today) : diffDays(a.start, today) + 1) : 0;
    const actualCost = costs.filter(c => c.activityId === a.id).reduce((s, c) => s + c.amount, 0);
    return { ...a, logs: my, done, actualPct, plannedPct, variance, status, delayDays, lastLog, forecastEnd, projectedDelay, idleDays, actualCost, complete };
  });
  const counts = {};
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const allBudget = acts.length > 0 && acts.every(a => a.budget > 0);
  const w = (r) => (allBudget ? r.budget : 1);
  const tw = rows.reduce((s, r) => s + w(r), 0);
  const plannedAvg = tw ? round1(rows.reduce((s, r) => s + w(r) * r.plannedPct, 0) / tw) : null;
  const actualAvg = tw ? round1(rows.reduce((s, r) => s + w(r) * r.actualPct, 0) / tw) : null;
  return { rows, counts, plannedAvg, actualAvg, variance: plannedAvg === null ? null : round1(actualAvg - plannedAvg), weighted: allBudget ? "budget" : "equal" };
}

/* ---- cost: BAC / PV / EV / AC / CPI / SPI / EAC ---- */
function analyzeCost(plan, trk, tr, act, today) {
  const costs = [...trk.costs].sort((a, b) => (a.date < b.date ? -1 : 1));
  const AC = costs.reduce((s, c) => s + c.amount, 0);
  const BAC = plan && plan.budget > 0 ? plan.budget : null;
  const P = tr && tr.latest ? tr.latest.progress : act && act.actualAvg !== null ? act.actualAvg : null;
  const plannedNow = plan && tr ? tr.plannedFor(today).cum : null;
  const PV = BAC !== null && plannedNow !== null ? BAC * (plannedNow / 100) : null;
  const EV = BAC !== null && P !== null ? BAC * (P / 100) : null;
  const CPI = EV !== null && AC > 0 ? round2(EV / AC) : null;
  const SPI = EV !== null && PV !== null && PV > 0 ? round2(EV / PV) : null;
  const EAC = BAC !== null && CPI !== null && CPI > 0 ? BAC / CPI : null;
  const usedPct = BAC !== null ? round1((AC / BAC) * 100) : null;

  const byCategory = {};
  costs.forEach(c => { byCategory[c.category] = (byCategory[c.category] || 0) + c.amount; });
  const categories = Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const plannedByMonth = {};
  if (BAC !== null && plan) plan.months.forEach((m, i) => { plannedByMonth[m.key] = BAC * ((m.cum - (i ? plan.months[i - 1].cum : 0)) / 100); });
  const actualByMonth = {};
  costs.forEach(c => { const k = monthKey(c.date); actualByMonth[k] = (actualByMonth[k] || 0) + c.amount; });
  const keys = [...new Set([...Object.keys(plannedByMonth), ...Object.keys(actualByMonth)])].sort();
  let cp = 0, ca = 0;
  const monthly = keys.map(k => {
    cp += plannedByMonth[k] || 0; ca += actualByMonth[k] || 0;
    const future = k > monthKey(today);
    return { key: k, label: monthLabel(k), planned: Math.round(plannedByMonth[k] || 0), actual: Math.round(actualByMonth[k] || 0), cumPlanned: Math.round(cp), cumActual: future && !actualByMonth[k] ? null : Math.round(ca) };
  });

  const alerts = [];
  if (BAC !== null && AC > BAC) alerts.push({ key: "cost:over", severity: "Critical", title: "Budget exceeded", detail: `Spent ${fmtMoney(AC)} against a budget of ${fmtMoney(BAC)} (${fmtMoney(AC - BAC)} over).` });
  else if (CPI !== null && CPI < 0.9) alerts.push({ key: "cost:cpi", severity: CPI < 0.75 ? "Critical" : "High", title: "Cost running above earned value", detail: `Spent ${fmtMoney(AC)} for work worth ${fmtMoney(EV)} (CPI ${CPI}).${EAC !== null ? ` At this rate the final cost is about ${fmtMoney(EAC)} vs ${fmtMoney(BAC)} budget.` : ""}` });
  else if (BAC !== null && P !== null && usedPct > P + 10) alerts.push({ key: "cost:ahead", severity: "Medium", title: "Spending ahead of progress", detail: `${usedPct}% of budget spent vs ${P}% progress reported.` });
  return { AC, BAC, P, PV, EV, CPI, SPI, EAC, usedPct, categories, monthly, costs, alerts };
}

/* ---- safety + weather ---- */
function analyzeSafety(incidents, actuals, today) {
  const sorted = [...incidents].sort((a, b) => (a.date < b.date ? 1 : -1));
  const open = sorted.filter(i => i.status !== "Closed");
  const last = sorted.length ? sorted[0].date : null;
  const since30 = addDays(today, -30);
  const recent = sorted.filter(i => i.date >= since30);
  const wt = { Minor: 5, Major: 15, Critical: 30 };
  const score30 = clamp(100 - recent.reduce((s, i) => s + (wt[i.severity] || 5), 0), 0, 100);
  const manDays = actuals.reduce((s, e) => s + e.workers, 0);
  const lti = sorted.filter(i => i.type === "Lost-time injury").length;
  const weatherDays = {}, lostByWeather = {}, lostByReason = {};
  let lostTotal = 0;
  actuals.forEach(e => {
    if (e.weather) weatherDays[e.weather] = (weatherDays[e.weather] || 0) + 1;
    if (e.hoursLost > 0) {
      lostTotal += e.hoursLost;
      if (e.weather) lostByWeather[e.weather] = (lostByWeather[e.weather] || 0) + e.hoursLost;
      if (e.reason) lostByReason[e.reason] = (lostByReason[e.reason] || 0) + e.hoursLost;
    }
  });
  const alerts = [];
  open.forEach(i => {
    if (i.severity === "Critical") alerts.push({ key: `safe:${i.id}`, severity: "Critical", title: "Open critical safety incident", detail: `${i.type} on ${fmtDMY(i.date)}: ${i.description || "no description"}` });
    else if (i.severity === "Major") alerts.push({ key: `safe:${i.id}`, severity: "High", title: "Open major safety incident", detail: `${i.type} on ${fmtDMY(i.date)}: ${i.description || "no description"}` });
  });
  recent.filter(i => i.type === "Lost-time injury" && i.status === "Closed").forEach(i => alerts.push({ key: `safe:${i.id}`, severity: "Medium", title: "Lost-time injury in the last 30 days", detail: `${fmtDMY(i.date)}: ${i.description || i.type}` }));
  return {
    sorted, open, last, daysSince: last ? diffDays(last, today) : null, score30, lti, total: incidents.length, manDays,
    rate: manDays > 0 ? round2((incidents.length / manDays) * 10000) : null, recentCount: recent.length,
    weatherDays, lostByWeather, lostByReason, lostTotal, alerts,
  };
}

/* ---- contractors (from activities, costs and incidents the user entered) ---- */
function analyzeContractors(trk, act) {
  const names = new Set();
  trk.activities.forEach(a => a.contractor && names.add(a.contractor.trim()));
  trk.costs.forEach(c => c.contractor && names.add(c.contractor.trim()));
  trk.incidents.forEach(i => i.contractor && names.add(i.contractor.trim()));
  const rows = act ? act.rows : [];
  return [...names].filter(Boolean).map(name => {
    const mine = rows.filter(r => (r.contractor || "").trim() === name);
    const ev = mine.reduce((s, r) => s + r.actualPct, 0), pv = mine.reduce((s, r) => s + r.plannedPct, 0);
    const plannedAvg = mine.length ? round1(pv / mine.length) : null;
    const actualAvg = mine.length ? round1(ev / mine.length) : null;
    const actIds = new Set(mine.map(r => r.id));
    const spent = trk.costs.filter(c => (c.contractor || "").trim() === name || (!c.contractor && actIds.has(c.activityId))).reduce((s, c) => s + c.amount, 0);
    return {
      name, activities: mine.length, delayed: mine.filter(r => r.status === "Delayed").length, atRisk: mine.filter(r => r.status === "At Risk").length,
      completed: mine.filter(r => r.status === "Completed").length, plannedAvg, actualAvg,
      variance: plannedAvg === null ? null : round1(actualAvg - plannedAvg), spi: pv > 0 ? round2(ev / pv) : null,
      budget: mine.reduce((s, r) => s + (r.budget || 0), 0), spent,
      incidents: trk.incidents.filter(i => (i.contractor || "").trim() === name).length,
      worstDelay: mine.reduce((m, r) => Math.max(m, r.delayDays), 0),
    };
  }).sort((a, b) => (a.spi === null ? 9 : a.spi) - (b.spi === null ? 9 : b.spi));
}

/* ---- period-wise (daily / weekly / monthly) planned vs actual ---- */
function mondayOf(iso) { return addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7)); }
function buildPeriods(summary, mode, today) {
  const tr = summary.tr, plan = summary.plan, trk = summary.trk;
  if (!tr || !plan) return { buckets: [], reason: "no-plan" };
  const entryDates = tr.rows.map(r => r.date);
  const from0 = entryDates.length && entryDates[0] < plan.startDate ? entryDates[0] : plan.startDate;
  const lastEntry = entryDates.length ? entryDates[entryDates.length - 1] : null;
  const capEnd = today < plan.endDate ? today : plan.endDate;
  const to0 = lastEntry && lastEntry > capEnd ? lastEntry : capEnd;
  if (from0 > today) return { buckets: [], reason: "not-started" };
  let spans = [];
  if (mode === "daily") { for (let d = from0; d <= to0; d = addDays(d, 1)) spans.push({ from: d, to: d, label: fmtShort(d) }); spans = spans.slice(-31); }
  else if (mode === "weekly") { for (let s = mondayOf(from0); s <= to0; s = addDays(s, 7)) spans.push({ from: s, to: addDays(s, 6), label: `Wk ${fmtShort(s)}` }); spans = spans.slice(-16); }
  else monthsInRange(from0, to0).forEach(k => { const [y, m] = k.split("-").map(Number); spans.push({ from: `${k}-01`, to: toISO(new Date(Date.UTC(y, m, 0))), label: monthLabel(k) }); });

  const withProg = tr.rows.filter(r => r.progress !== null && r.progress !== undefined);
  const progressAt = (iso) => { let v = null; for (const r of withProg) { if (r.date <= iso) v = r.progress; else break; } return v; };
  const delayFor = (A, ref) => {
    const p = tr.cumAt(ref);
    if (A < p - 0.05) { let d = plan.startDate; for (const c of tr.curve) { if (c.cum >= A) { d = c.date; break; } } return Math.max(0, diffDays(d, ref)); }
    if (A > p + 0.05) { let d = plan.endDate; for (const c of tr.curve) { if (c.cum >= A) { d = c.date; break; } } return -Math.max(0, diffDays(ref, d)); }
    return 0;
  };
  const BAC = summary.cost.BAC;
  const buckets = spans.filter(b => b.from <= today).map(b => {
    const eff = b.to > today ? today : b.to;
    const rows = tr.rows.filter(r => r.date >= b.from && r.date <= eff);
    const comp = rows.filter(r => r.working);
    let wdn = 0, pw = 0, pm = 0;
    for (let d = b.from < plan.startDate ? plan.startDate : b.from; d <= eff && d <= plan.endDate; d = addDays(d, 1)) {
      if (isWorkingDay(d, plan.perWeek)) { wdn++; const p = tr.plannedFor(d); pw += p.workers; pm += p.machines; }
    }
    const plannedEnd = round1(tr.cumAt(eff)), plannedPrev = round1(tr.cumAt(addDays(b.from, -1)));
    const aEnd = progressAt(eff), aPrevRaw = progressAt(addDays(b.from, -1));
    const aPrev = aPrevRaw === null ? 0 : aPrevRaw;
    const variance = aEnd === null ? null : round1(aEnd - plannedEnd);
    const sumC = (f) => comp.reduce((s, r) => s + f(r), 0);
    const spendA = trk.costs.filter(c => c.date >= b.from && c.date <= eff).reduce((s, c) => s + c.amount, 0);
    return {
      label: b.label, from: b.from, to: eff, reports: rows.length, stale: rows.length === 0,
      plannedEnd, actualEnd: aEnd, variance, status: statusFromVariance(variance),
      delay: aEnd === null ? null : delayFor(aEnd, eff),
      plannedMade: round1(plannedEnd - plannedPrev), actualMade: aEnd === null ? null : round1(aEnd - aPrev),
      plannedWorkers: wdn ? round1(pw / wdn) : null, actualWorkers: comp.length ? round1(sumC(r => r.workers) / comp.length) : null,
      plannedMachines: wdn ? round1(pm / wdn) : null, actualMachines: comp.length ? round1(sumC(r => r.machines) / comp.length) : null,
      hoursLost: rows.reduce((s, r) => s + (r.hoursLost || 0), 0),
      spendPlanned: BAC !== null ? Math.round(BAC * ((plannedEnd - plannedPrev) / 100)) : null, spendActual: Math.round(spendA),
      incidents: trk.incidents.filter(i => i.date >= b.from && i.date <= eff).length,
    };
  });
  return { buckets, reason: buckets.length ? null : "empty" };
}

/* ---- one summary object that every page / the top bar / the copilot read ---- */
function summarizeProject(trkRaw, today) {
  const trk = normTrk(trkRaw);
  const plan = trk.plan;
  const tr = plan ? analyzeTracker(plan, trk.actuals, today) : null;
  const act = trk.activities.length ? analyzeActivities(trk.activities, trk.actLogs, trk.costs, today) : null;
  const cost = analyzeCost(plan, trk, tr, act, today);
  const safety = analyzeSafety(trk.incidents, trk.actuals, today);
  const contractors = analyzeContractors(trk, act);

  let progress = { planned: null, actual: null, variance: null, source: null, date: null };
  if (tr && tr.latest) progress = { planned: tr.latest.plannedProgress, actual: tr.latest.progress, variance: tr.latest.progressVar, source: "daily reports", date: tr.latest.date };
  else if (act && act.actualAvg !== null) progress = { planned: act.plannedAvg, actual: act.actualAvg, variance: act.variance, source: "activities", date: today };
  const status = statusFromVariance(progress.variance);

  const parts = [];
  if (progress.variance !== null) parts.push({ label: "Schedule", value: clamp(Math.round(100 - Math.max(0, -progress.variance) * 5), 0, 100) });
  if (tr && tr.resources.compDays) {
    const sh = [tr.resources.workerShort, tr.resources.machineShort].filter(v => v !== null).map(v => Math.max(0, v));
    if (sh.length) parts.push({ label: "Resources", value: clamp(Math.round(100 - sh.reduce((s, v) => s + v, 0) / sh.length), 0, 100) });
  }
  if (cost.CPI !== null) parts.push({ label: "Cost", value: clamp(Math.round(cost.CPI * 100), 0, 100) });
  if (trk.actuals.length) parts.push({ label: "Safety", value: safety.score30 });
  if (tr && today >= plan.startDate) parts.push({ label: "Reporting", value: clamp(100 - tr.missing.trailing * 10, 0, 100) });
  const score = parts.length ? Math.round(parts.reduce((s, p) => s + p.value, 0) / parts.length) : null;
  const level = score === null ? null : score >= 80 ? "Healthy" : score >= 60 ? "At Risk" : "Critical";

  const alerts = [];
  if (tr) tr.alerts.forEach(a => alerts.push({ ...a, key: `trk:${a.title}`, category: /Workforce|Machines/.test(a.title) ? "Resources" : /Reporting/.test(a.title) ? "Reporting" : "Schedule", view: a.title === "Reporting gap" ? "planactual" : "delays" }));
  if (act) act.rows.forEach(r => {
    if (r.status === "Delayed") alerts.push({ key: `act:${r.id}:late`, severity: r.delayDays >= 7 || r.variance <= -15 ? "Critical" : "High", category: "Activity", view: "activities", title: `Activity delayed: ${r.name}`, detail: `${r.actualPct}% done vs ${r.plannedPct}% planned — ${r.delayDays} day${r.delayDays === 1 ? "" : "s"} behind${r.projectedDelay > 0 ? `; forecast finish ${fmtDMY(r.forecastEnd)} (+${r.projectedDelay}d)` : ""}.` });
    else if (r.status === "At Risk") alerts.push({ key: `act:${r.id}:risk`, severity: "Medium", category: "Activity", view: "activities", title: `Activity at risk: ${r.name}`, detail: `${r.actualPct}% done vs ${r.plannedPct}% planned (${r.variance} pts).` });
    if (r.idleDays >= 3 && r.status !== "Not started") alerts.push({ key: `act:${r.id}:idle`, severity: "Medium", category: "Activity", view: "activities", title: `No progress logged: ${r.name}`, detail: `${r.lastLog ? `Last log ${fmtDMY(r.lastLog)}` : "No progress logged since planned start"} — ${r.idleDays} days.` });
  });
  cost.alerts.forEach(a => alerts.push({ ...a, category: "Cost", view: "cost" }));
  safety.alerts.forEach(a => alerts.push({ ...a, category: "Safety", view: "safety" }));
  alerts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const finalLevel = level === "Healthy" && alerts.some(x => x.severity === "Critical") ? "At Risk" : level;

  return {
    trk, plan, tr, act, cost, safety, contractors, progress, status, health: { score, level: finalLevel, parts }, alerts,
    delayDays: tr ? tr.delayDays : null, aheadDays: tr ? tr.aheadDays : null,
    forecastEnd: tr ? tr.forecastEnd : null, projectedDelay: tr ? tr.projectedDelay : null,
    hasAnyData: !!(plan || trk.activities.length || trk.costs.length || trk.incidents.length),
  };
}
function emptySummary() { return summarizeProject(null, todayISO()); }

/* Small shared bits used by the new pages */
function EmptyState({ theme, icon: Icon, title, text, action }) {
  return (
    <Card theme={theme} style={{ textAlign: "center", padding: 34 }}>
      <div style={{ width: 46, height: 46, borderRadius: 3, background: theme.accentSoft, display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
        <Icon size={22} color={theme.accent} />
      </div>
      <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.text }}>{title}</div>
      <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, margin: "6px auto 16px", maxWidth: 520 }}>{text}</div>
      {action}
    </Card>
  );
}
function Sparkline({ values, color, width = 96, height = 28 }) {
  const v = (values || []).filter((x) => typeof x === "number" && isFinite(x));
  if (v.length < 2) return null;
  const mn = Math.min(...v), mx = Math.max(...v), rng = mx - mn || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (width - 6) + 3, height - 4 - ((y - mn) / rng) * (height - 8)]);
  const line = pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <polygon points={`${pts[0][0]},${height} ${line} ${last[0]},${height}`} fill={color} opacity="0.14" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="bs-spark-dot" cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>);
}
function StatTile({ theme, label, value, sub, color, spark, trend }) {
  const mm = typeof value === "number" ? { n: value, d: (String(value).split(".")[1] || "").length, suf: "" }
    : typeof value === "string" && /^-?\d+(\.\d+)?%?$/.test(value) ? { n: parseFloat(value), d: (value.split(".")[1] || "").replace("%", "").length, suf: value.endsWith("%") ? "%" : "" } : null;
  const shown = useCountUp(mm ? mm.n : 0, 1000);
  const display = mm ? shown.toFixed(mm.d) + mm.suf : value;
  const tone = color || theme.accent;
  return (
    <Card theme={theme} className="bs-stat" style={{ minWidth: 0, borderTop: `2px solid ${color || theme.border}`, background: theme.panel }}>
      <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: color || theme.text, letterSpacing: -0.4 }}>{display}</span>
          {trend && (trend.up ? <ArrowUpRight size={16} color={trend.good ? theme.green : theme.red} /> : <ArrowDownRight size={16} color={trend.good ? theme.green : theme.red} />)}
        </div>
        <Sparkline values={spark} color={tone} />
      </div>
      {sub && <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </Card>
  );
}
function DelayBanner({ theme, all, project, onSelectProject, setView }) {
  const rank = { Delayed: 0, "At Risk": 1 };
  const flagged = all.filter((x) => x.s && rank[x.s.status] !== undefined).sort((a, b) => rank[a.s.status] - rank[b.s.status] || (b.s.delayDays || 0) - (a.s.delayDays || 0));
  const withData = all.filter((x) => x.s && x.s.status).length;
  if (!flagged.length) return withData ? (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${theme.green}`, borderLeft: `5px solid ${theme.green}`, borderRadius: 3, padding: "9px 14px", marginBottom: 12, background: hexAlpha(theme.green, 0.1), fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: theme.text }}>
      <CircleCheck size={16} color={theme.green} />All projects are on schedule
    </div>) : null;
  const col = flagged[0].s.status === "Delayed" ? theme.red : theme.warn;
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: `1px solid ${col}`, borderLeft: `5px solid ${col}`, borderRadius: 3, padding: "10px 14px", marginBottom: 12, background: hexAlpha(col, 0.1) }}>
      <CircleAlert size={18} color={col} />
      <div style={{ fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 800, color: theme.text }}>{flagged.length} project{flagged.length === 1 ? "" : "s"} behind schedule</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
        {flagged.map((x) => {
          const c = x.s.status === "Delayed" ? theme.red : theme.warn;
          return (
            <button key={x.p.id} onClick={() => onSelectProject(x.p.id)} className="bs-btn" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", border: `1px solid ${x.p.id === project.id ? c : theme.border}`, background: theme.panel, borderRadius: 999, padding: "4px 10px", fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{x.p.name}
              <span style={{ fontFamily: FONT_MONO, color: c }}>{x.s.delayDays > 0 ? `${x.s.delayDays}d behind` : x.s.status}</span>
            </button>);
        })}
      </div>
    </div>);
}
const chartTip = (theme) => ({ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, fontFamily: FONT_UI, fontSize: 12, color: theme.text });
const chartAxis = (theme) => ({ stroke: theme.textFaint, fontSize: 11, fontFamily: FONT_MONO });
const thStyle = (theme) => ({ textAlign: "left", padding: "8px 10px", fontFamily: FONT_UI, fontSize: 11, color: theme.textFaint, fontWeight: 700, whiteSpace: "nowrap" });
const tdStyle = (theme) => ({ padding: "8px 10px", fontFamily: FONT_MONO, fontSize: 12.5, color: theme.text, whiteSpace: "nowrap" });
const signedNum = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}${suffix}`);


function Field({ theme, label, children, style }) {
  return <div style={style}><label style={trkLabel(theme)}>{label}</label>{children}</div>;
}

/* =========================================================================
   ACTIVITIES — planned vs actual quantity for each work item
   ========================================================================= */
function ActivityFormModal({ theme, trk, onClose, onSave }) {
  const inputStyle = trkInput(theme);
  const [f, setF] = useState({ name: "", unit: ACTIVITY_UNITS[0], plannedQty: "", start: trk.plan ? trk.plan.startDate : "", end: trk.plan ? trk.plan.endDate : "", contractor: "", budget: "" });
  const [error, setError] = useState("");
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); if (error) setError(""); };
  const names = [...new Set(trk.activities.map(a => a.contractor).filter(Boolean))];
  const submit = () => {
    if (!f.name.trim()) return setError("Activity name is required.");
    const q = Number(f.plannedQty);
    if (f.plannedQty === "" || isNaN(q) || q <= 0) return setError("Planned quantity must be a number above 0.");
    if (!isValidISO(f.start) || !isValidISO(f.end)) return setError("Planned start and finish dates are required.");
    if (f.end < f.start) return setError("Planned finish can't be before planned start.");
    let budget = 0;
    if (f.budget !== "") { budget = Number(f.budget); if (isNaN(budget) || budget < 0) return setError("Budget must be 0 or more."); }
    onSave({ id: newId("a"), name: f.name.trim(), unit: f.unit, plannedQty: q, start: f.start, end: f.end, contractor: f.contractor.trim(), budget });
  };
  return (
    <Modal theme={theme} title="Add Activity" onClose={onClose} width={680}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field theme={theme} label="Activity name *" style={{ gridColumn: "1 / -1" }}>
          <input style={inputStyle} className="bs-input-focus" placeholder="e.g. Earthwork excavation" value={f.name} onChange={e => set("name", e.target.value)} />
        </Field>
        <Field theme={theme} label="Planned quantity *">
          <input type="number" min="0" style={inputStyle} className="bs-input-focus" placeholder="e.g. 12000" value={f.plannedQty} onChange={e => set("plannedQty", e.target.value)} />
        </Field>
        <Field theme={theme} label="Unit">
          <select style={inputStyle} className="bs-input-focus" value={f.unit} onChange={e => set("unit", e.target.value)}>{ACTIVITY_UNITS.map(u => <option key={u}>{u}</option>)}</select>
        </Field>
        <Field theme={theme} label="Planned start *"><input type="date" style={inputStyle} className="bs-input-focus" value={f.start} onChange={e => set("start", e.target.value)} /></Field>
        <Field theme={theme} label="Planned finish *"><input type="date" style={inputStyle} className="bs-input-focus" value={f.end} onChange={e => set("end", e.target.value)} /></Field>
        <Field theme={theme} label="Contractor (optional)">
          <input list="trk-contractors" style={inputStyle} className="bs-input-focus" placeholder="Who executes this activity" value={f.contractor} onChange={e => set("contractor", e.target.value)} />
          <datalist id="trk-contractors">{names.map(n => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field theme={theme} label="Activity budget ₹ (optional)">
          <input type="number" min="0" style={inputStyle} className="bs-input-focus" placeholder="e.g. 4500000" value={f.budget} onChange={e => set("budget", e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textMuted }}>
        Planned progress is spread evenly between the planned start and finish dates. Actual progress comes from the quantities you log.
      </div>
      {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Button theme={theme} icon={Check} onClick={submit}>Save Activity</Button>
        <Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function ActivityLogModal({ theme, row, onClose, onSave }) {
  const inputStyle = trkInput(theme);
  const today = todayISO();
  const [f, setF] = useState({ date: today, qty: "", note: "" });
  const [error, setError] = useState("");
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); if (error) setError(""); };
  const left = Math.max(0, row.plannedQty - row.done);
  const submit = () => {
    if (!isValidISO(f.date)) return setError("Choose a valid date.");
    if (f.date > today) return setError("Future dates can't be logged.");
    const q = Number(f.qty);
    if (f.qty === "" || isNaN(q) || q <= 0) return setError("Quantity done must be above 0.");
    if (q > left + 1e-9) return setError(`Only ${round2(left)} ${row.unit} is left of the planned quantity. Edit the activity's planned quantity first if the scope grew.`);
    onSave({ id: newId("l"), activityId: row.id, date: f.date, qty: q, note: f.note.trim() });
  };
  return (
    <Modal theme={theme} title={`Log progress — ${row.name}`} onClose={onClose} width={520}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>
        Done so far {round2(row.done)} / {row.plannedQty} {row.unit} ({row.actualPct}%) · planned {row.plannedPct}% by today
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field theme={theme} label="Date"><input type="date" max={today} style={inputStyle} className="bs-input-focus" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field theme={theme} label={`Quantity done (${row.unit})`}><input type="number" min="0" style={inputStyle} className="bs-input-focus" value={f.qty} onChange={e => set("qty", e.target.value)} /></Field>
        <Field theme={theme} label="Note (optional)" style={{ gridColumn: "1 / -1" }}><input style={inputStyle} className="bs-input-focus" value={f.note} onChange={e => set("note", e.target.value)} /></Field>
      </div>
      {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Button theme={theme} icon={Check} onClick={submit}>Save Log</Button>
        <Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function ActivitiesPage({ theme, project, summary, onAddActivity, onDeleteActivity, onLogActivity, onDeleteLog, setView }) {
  const trk = summary.trk, act = summary.act;
  const [addOpen, setAddOpen] = useState(false);
  const [logFor, setLogFor] = useState(null);
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("All");
  const th = thStyle(theme), td = tdStyle(theme);
  const rows = act ? act.rows : [];
  const shown = filter === "All" ? rows : rows.filter(r => r.status === filter);
  const selRow = rows.find(r => r.id === sel) || null;
  const logRow = rows.find(r => r.id === logFor) || null;

  const detailData = useMemo(() => {
    if (!selRow) return [];
    const pts = new Set([selRow.start, selRow.end, ...selRow.logs.map(l => l.date)]);
    let cum = 0; const cumByDate = {};
    selRow.logs.forEach(l => { cum += l.qty; cumByDate[l.date] = round2(cum); });
    return [...pts].sort().map(d => ({ x: diffDays(selRow.start, d), date: d, planned: round2(selRow.plannedQty * actPlannedPct(selRow, d) / 100), actual: cumByDate[d] === undefined ? null : cumByDate[d] }));
  }, [selRow]);

  const hero = (
    <PageHero theme={theme} icon={ListChecks} title="Activities — Planned vs Actual" subtitle={`${project.name} — plan each work item, log the quantity done, and see which one is slipping`}
      tickerItems={rows.length ? [`${rows.length} activities`, act.actualAvg !== null ? `Overall ${act.actualAvg}% actual vs ${act.plannedAvg}% planned today (${act.weighted}-weighted)` : "", `${(act.counts["Delayed"] || 0)} delayed · ${(act.counts["At Risk"] || 0)} at risk · ${(act.counts["Completed"] || 0)} completed`].filter(Boolean) : [`Add the activities of ${project.name} to track them`]}
      right={<Button theme={theme} icon={Plus} onClick={() => setAddOpen(true)}>Add Activity</Button>} />
  );
  const modals = (<>
    {addOpen && <ActivityFormModal theme={theme} trk={trk} onClose={() => setAddOpen(false)} onSave={(a) => { onAddActivity(a); setAddOpen(false); }} />}
    {logRow && <ActivityLogModal theme={theme} row={logRow} onClose={() => setLogFor(null)} onSave={(l) => { onLogActivity(l); setLogFor(null); }} />}
  </>);

  if (!rows.length) {
    return (<div>{hero}<EmptyState theme={theme} icon={ListChecks} title="No activities yet"
      text="Add work items like Earthwork or Paving with a planned quantity and dates. Then log the quantity completed and this page shows each activity's progress, delay and forecast finish."
      action={<Button theme={theme} icon={Plus} onClick={() => setAddOpen(true)}>Add First Activity</Button>} />{modals}</div>);
  }
  const chartData = rows.slice(0, 14).map(r => ({ name: r.name.length > 16 ? r.name.slice(0, 15) + "…" : r.name, Planned: r.plannedPct, Actual: r.actualPct }));
  return (
    <div>
      {hero}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Overall progress" value={act.actualAvg === null ? "—" : `${act.actualAvg}%`} sub={`Planned ${act.plannedAvg}% by today · variance ${signedNum(act.variance)} pts`} color={act.variance <= -6 ? theme.red : act.variance <= -2 ? theme.accent : theme.text} />
        <StatTile theme={theme} label="Delayed" value={act.counts["Delayed"] || 0} sub="Activities 6+ pts behind (or overdue)" color={(act.counts["Delayed"] || 0) ? theme.red : theme.text} />
        <StatTile theme={theme} label="At risk" value={act.counts["At Risk"] || 0} sub="2 to 6 pts behind plan" color={(act.counts["At Risk"] || 0) ? theme.warn : theme.text} />
        <StatTile theme={theme} label="Completed" value={`${act.counts["Completed"] || 0} / ${rows.length}`} sub="Full planned quantity logged" color={theme.green} />
      </div>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Planned vs actual % by activity" sub="Planned % is the share of the activity that should be done by today" />
        <div style={{ width: "100%", height: 250 }}>
          <LoopRC>
            <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
              <XAxis dataKey="name" {...chartAxis(theme)} />
              <YAxis domain={[0, 100]} unit="%" {...chartAxis(theme)} />
              <Tooltip contentStyle={chartTip(theme)} />
              <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="Planned" fill={theme.blue} radius={[4, 4, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="Actual" fill={theme.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </LoopRC>
        </div>
      </Card>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Activity register" sub="Click a row for its quantity curve and log history"
          right={<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["All", "Delayed", "At Risk", "On Track", "Ahead", "Completed", "Not started"].map(s => (
              <Button key={s} theme={theme} small kind={filter === s ? "primary" : "ghost"} onClick={() => setFilter(s)}>{s}</Button>))}
          </div>} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              {["Activity", "Contractor", "Planned window", "Done / planned", "Plan %", "Actual %", "Δ pts", "Status", "Behind", "Forecast finish", "Cost / budget", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} className="bs-row" onClick={() => setSel(r.id === sel ? null : r.id)} style={{ borderBottom: `1px solid ${theme.borderSoft}`, background: r.id === sel ? theme.panelAlt : "transparent" }}>
                  <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ ...td, fontFamily: FONT_UI, color: theme.textMuted }}>{r.contractor || "—"}</td>
                  <td style={td}>{fmtShort(r.start)} → {fmtShort(r.end)}</td>
                  <td style={td}>{round2(r.done)} / {r.plannedQty} {r.unit}</td>
                  <td style={td}>{r.plannedPct}%</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.actualPct}%</td>
                  <td style={{ ...td, fontWeight: 700, color: r.variance < 0 ? theme.red : r.variance > 0 ? theme.green : theme.textMuted }}>{signedNum(r.variance)}</td>
                  <td style={td}><StatusBadge theme={theme} status={r.status} /></td>
                  <td style={td}>{r.delayDays > 0 ? `${r.delayDays}d` : "—"}</td>
                  <td style={td}>{r.forecastEnd ? `${fmtShort(r.forecastEnd)}${r.projectedDelay > 0 ? ` (+${r.projectedDelay}d)` : r.projectedDelay < 0 ? ` (${r.projectedDelay}d)` : ""}` : "—"}</td>
                  <td style={td}>{r.budget > 0 || r.actualCost > 0 ? `${fmtMoney(r.actualCost)} / ${r.budget > 0 ? fmtMoney(r.budget) : "—"}` : "—"}</td>
                  <td style={td} onClick={e => e.stopPropagation()}>
                    <span style={{ display: "inline-flex", gap: 4 }}>
                      <Button theme={theme} small kind="ghost" icon={Plus} onClick={() => setLogFor(r.id)}>Log</Button>
                      <IconBtn theme={theme} icon={Trash2} title="Delete activity and its logs" onClick={() => onDeleteActivity(r.id)} />
                    </span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={12} style={{ ...td, fontFamily: FONT_UI, color: theme.textMuted, padding: 16 }}>No activities with this status.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {selRow && (
        <Card theme={theme}>
          <SectionTitle theme={theme} title={`${selRow.name} — quantity curve`} sub={`${selRow.logs.length} log${selRow.logs.length === 1 ? "" : "s"} · cumulative ${selRow.unit}, planned dashed vs actual`} />
          <div style={{ width: "100%", height: 230 }}>
            <LoopRC>
              <LineChart data={detailData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                <XAxis dataKey="x" type="number" domain={[0, Math.max(...detailData.map(d => d.x), 1)]} tickFormatter={(v) => fmtShort(addDays(selRow.start, v))} {...chartAxis(theme)} />
                <YAxis {...chartAxis(theme)} />
                <Tooltip contentStyle={chartTip(theme)} labelFormatter={(v) => fmtDMY(addDays(selRow.start, v))} />
                <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                <Line isAnimationActive={false} type="linear" dataKey="planned" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </LoopRC>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {[...selRow.logs].reverse().map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "7px 10px" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, width: 90 }}>{fmtDMY(l.date)}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: theme.text }}>+{l.qty} {selRow.unit}</span>
                <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, flex: 1 }}>{l.note}</span>
                <IconBtn theme={theme} icon={Trash2} title="Delete log" onClick={() => onDeleteLog(l.id)} />
              </div>
            ))}
            {selRow.logs.length === 0 && <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted }}>No progress logged yet for this activity.</div>}
          </div>
        </Card>
      )}
      {modals}
    </div>
  );
}

/* =========================================================================
   COST & BUDGET — budget vs actual spend, earned value, forecast final cost
   ========================================================================= */
function CostPage({ theme, project, summary, onAddCost, onDeleteCost, onEditPlan }) {
  const trk = summary.trk, c = summary.cost, act = summary.act;
  const inputStyle = trkInput(theme);
  const today = todayISO();
  const blank = () => ({ date: today, category: COST_CATEGORIES[0], amount: "", activityId: "", contractor: "", note: "" });
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("monthly");
  const th = thStyle(theme), td = tdStyle(theme);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); if (error) setError(""); };
  const names = [...new Set([...trk.activities.map(a => a.contractor), ...trk.costs.map(x => x.contractor)].filter(Boolean))];
  const submit = () => {
    if (!isValidISO(f.date)) return setError("Choose a valid date.");
    if (f.date > today) return setError("Future dates can't be booked.");
    const amt = Number(f.amount);
    if (f.amount === "" || isNaN(amt) || amt <= 0) return setError("Amount must be above 0 (in ₹).");
    onAddCost({ id: newId("c"), date: f.date, category: f.category, amount: amt, activityId: f.activityId, contractor: f.contractor.trim(), note: f.note.trim() });
    setF(blank());
  };
  const palette = [theme.accent, theme.blue, theme.green, theme.red, "#9C8CF0", "#3ABEC0", "#E37FC3"];
  const cpiColor = c.CPI === null ? theme.text : c.CPI < 0.9 ? theme.red : c.CPI < 1 ? theme.accent : theme.green;
  return (
    <div>
      <PageHero theme={theme} icon={Wallet} title="Cost & Budget" subtitle={`${project.name} — budget vs actual spend, earned value and forecast final cost`}
        tickerItems={[c.BAC !== null ? `Budget ${fmtMoney(c.BAC)}` : "Budget not set in plan", `Spent ${fmtMoney(c.AC)}${c.usedPct !== null ? ` (${c.usedPct}% of budget)` : ""}`, c.CPI !== null ? `CPI ${c.CPI}` : "CPI needs spend + progress"]} />
      {c.BAC === null && (
        <Card theme={theme} style={{ marginBottom: 12, borderColor: theme.accent }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, flex: 1 }}>
              {summary.plan ? "No total budget in the plan." : "This project has no plan yet."} Costs can still be recorded, but budget comparison, earned value and the forecast final cost need a planned budget.
            </div>
            <Button theme={theme} small icon={Pencil} onClick={onEditPlan}>{summary.plan ? "Add budget to plan" : "Add planned data"}</Button>
          </div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Planned budget" value={fmtMoney(c.BAC)} sub={c.PV !== null ? `Planned value to date ${fmtMoney(c.PV)}` : "Set in the plan"} />
        <StatTile theme={theme} label="Spent so far" value={fmtMoney(c.AC)} sub={c.usedPct !== null ? `${c.usedPct}% of budget used${c.P !== null ? ` · ${c.P}% progress reported` : ""}` : `${trk.costs.length} cost entr${trk.costs.length === 1 ? "y" : "ies"}`} color={c.BAC !== null && c.AC > c.BAC ? theme.red : theme.text} />
        <StatTile theme={theme} label="Earned value" value={fmtMoney(c.EV)} sub={c.EV !== null ? "Budget × reported progress" : "Needs budget and a progress %"} />
        <StatTile theme={theme} label="Cost performance (CPI)" value={c.CPI === null ? "—" : c.CPI} sub="Earned value ÷ spent. Below 1.0 = paying more than the work is worth." color={cpiColor} />
        <StatTile theme={theme} label="Schedule performance (SPI)" value={c.SPI === null ? "—" : c.SPI} sub="Earned value ÷ planned value. Below 1.0 = behind plan." color={c.SPI === null ? theme.text : c.SPI < 0.9 ? theme.red : c.SPI < 1 ? theme.accent : theme.green} />
        <StatTile theme={theme} label="Forecast final cost" value={fmtMoney(c.EAC)} sub={c.EAC !== null ? `${c.EAC > c.BAC ? "Over" : "Under"} budget by ${fmtMoney(Math.abs(c.EAC - c.BAC))} at current CPI` : "Needs CPI (spend + progress)"} color={c.EAC !== null && c.EAC > c.BAC ? theme.red : theme.text} />
      </div>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Spend over time" sub={mode === "monthly" ? "Planned spend follows your monthly progress targets × budget" : "Cumulative planned vs actual spend"}
          right={<div style={{ display: "flex", gap: 6 }}>
            <Button theme={theme} small kind={mode === "monthly" ? "primary" : "ghost"} onClick={() => setMode("monthly")}>Monthly</Button>
            <Button theme={theme} small kind={mode === "cumulative" ? "primary" : "ghost"} onClick={() => setMode("cumulative")}>Cumulative</Button>
          </div>} />
        {c.monthly.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, padding: "24px 0", textAlign: "center" }}>Nothing to plot yet — add a budget to the plan or record a cost.</div> : (
          <div style={{ width: "100%", height: 260 }}>
            <LoopRC>
              {mode === "monthly" ? (
                <BarChart data={c.monthly} margin={{ top: 8, right: 12, bottom: 4, left: 6 }}>
                  <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...chartAxis(theme)} />
                  <YAxis tickFormatter={(v) => fmtMoney(v)} {...chartAxis(theme)} />
                  <Tooltip contentStyle={chartTip(theme)} formatter={(v) => fmtMoney(v)} />
                  <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                  <Bar isAnimationActive={false} dataKey="planned" name="Planned" fill={theme.blue} radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="actual" name="Actual" fill={theme.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={c.monthly} margin={{ top: 8, right: 12, bottom: 4, left: 6 }}>
                  <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...chartAxis(theme)} />
                  <YAxis tickFormatter={(v) => fmtMoney(v)} {...chartAxis(theme)} />
                  <Tooltip contentStyle={chartTip(theme)} formatter={(v) => fmtMoney(v)} />
                  <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="cumPlanned" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="cumActual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </LineChart>
              )}
            </LoopRC>
          </div>
        )}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Record a cost" sub="Every amount you enter is added to spend, the charts and the CPI" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field theme={theme} label="Date"><input type="date" max={today} style={inputStyle} className="bs-input-focus" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
            <Field theme={theme} label="Category"><select style={inputStyle} className="bs-input-focus" value={f.category} onChange={e => set("category", e.target.value)}>{COST_CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field theme={theme} label="Amount (₹)"><input type="number" min="0" style={inputStyle} className="bs-input-focus" placeholder="e.g. 250000" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field>
            <Field theme={theme} label="Activity (optional)"><select style={inputStyle} className="bs-input-focus" value={f.activityId} onChange={e => set("activityId", e.target.value)}><option value="">—</option>{trk.activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field theme={theme} label="Contractor (optional)">
              <input list="trk-contractors-c" style={inputStyle} className="bs-input-focus" value={f.contractor} onChange={e => set("contractor", e.target.value)} />
              <datalist id="trk-contractors-c">{names.map(n => <option key={n} value={n} />)}</datalist>
            </Field>
            <Field theme={theme} label="Note"><input style={inputStyle} className="bs-input-focus" value={f.note} onChange={e => set("note", e.target.value)} /></Field>
          </div>
          {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
          <div style={{ marginTop: 14 }}><Button theme={theme} icon={Plus} onClick={submit}>Add Cost</Button></div>
        </Card>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="By category" />
          {c.categories.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No costs recorded yet.</div> : (
            <>
              <div style={{ width: "100%", height: 150 }}>
                <LoopRC><PieChart><Pie isAnimationActive={false} data={c.categories} dataKey="value" nameKey="name" innerRadius={38} outerRadius={64} stroke="none">
                  {c.categories.map((x, i) => <Cell key={x.name} fill={palette[i % palette.length]} />)}</Pie>
                  <Tooltip contentStyle={chartTip(theme)} formatter={(v) => fmtMoney(v)} /></PieChart></LoopRC>
              </div>
              {c.categories.map((x, i) => (
                <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_UI, fontSize: 12.5, color: theme.text, padding: "3px 0" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: palette[i % palette.length] }} />{x.name}
                  <span style={{ marginLeft: "auto", fontFamily: FONT_MONO }}>{fmtMoney(x.value)}</span>
                </div>))}
            </>
          )}
        </Card>
      </div>
      {act && act.rows.some(r => r.budget > 0 || r.actualCost > 0) && (
        <Card theme={theme} style={{ marginBottom: 12 }}>
          <SectionTitle theme={theme} title="Activity budget vs spend" sub="Only costs tagged to an activity are counted here" />
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Activity", "Budget", "Spent", "Used %", "Progress %"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{act.rows.filter(r => r.budget > 0 || r.actualCost > 0).map(r => {
              const used = r.budget > 0 ? round1((r.actualCost / r.budget) * 100) : null;
              return (<tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}</td><td style={td}>{r.budget > 0 ? fmtMoney(r.budget) : "—"}</td>
                <td style={td}>{fmtMoney(r.actualCost)}</td>
                <td style={{ ...td, color: used !== null && used > r.actualPct + 10 ? theme.red : theme.text }}>{used === null ? "—" : `${used}%`}</td><td style={td}>{r.actualPct}%</td></tr>);
            })}</tbody></table></div>
        </Card>
      )}
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Cost entries" sub={`${trk.costs.length} recorded`} />
        {trk.costs.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No costs recorded yet.</div> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Date", "Category", "Amount", "Activity", "Contractor", "Note", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{[...trk.costs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60).map(x => (
              <tr key={x.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                <td style={td}>{fmtDMY(x.date)}</td><td style={{ ...td, fontFamily: FONT_UI }}>{x.category}</td><td style={{ ...td, fontWeight: 700 }}>{fmtMoney(x.amount)}</td>
                <td style={{ ...td, fontFamily: FONT_UI }}>{(trk.activities.find(a => a.id === x.activityId) || {}).name || "—"}</td>
                <td style={{ ...td, fontFamily: FONT_UI }}>{x.contractor || "—"}</td><td style={{ ...td, fontFamily: FONT_UI, color: theme.textMuted }}>{x.note}</td>
                <td style={td}><IconBtn theme={theme} icon={Trash2} title="Delete entry" onClick={() => onDeleteCost(x.id)} /></td></tr>))}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

/* =========================================================================
   SAFETY & SITE LOG — incidents, plus the weather / lost-hours log
   ========================================================================= */
function SafetyPage({ theme, project, summary, onAddIncident, onUpdateIncident, onDeleteIncident, setView }) {
  const trk = summary.trk, s = summary.safety;
  const inputStyle = trkInput(theme);
  const today = todayISO();
  const blank = () => ({ date: today, type: INCIDENT_TYPES[0], severity: INCIDENT_SEVERITY[0], contractor: "", description: "" });
  const [tab, setTab] = useState("incidents");
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const th = thStyle(theme), td = tdStyle(theme);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); if (error) setError(""); };
  const names = [...new Set([...trk.activities.map(a => a.contractor), ...trk.costs.map(x => x.contractor), ...trk.incidents.map(x => x.contractor)].filter(Boolean))];
  const submit = () => {
    if (!isValidISO(f.date)) return setError("Choose a valid date.");
    if (f.date > today) return setError("Future dates can't be logged.");
    if (!f.description.trim()) return setError("Describe what happened.");
    onAddIncident({ id: newId("i"), date: f.date, type: f.type, severity: f.severity, contractor: f.contractor.trim(), description: f.description.trim(), status: "Open" });
    setF(blank());
  };
  const logDays = [...trk.actuals].filter(e => e.weather || e.hoursLost > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const rainy = (s.weatherDays["Light rain"] || 0) + (s.weatherDays["Heavy rain"] || 0);
  const lostW = Object.entries(s.lostByWeather).map(([name, hours]) => ({ name, hours }));
  const lostR = Object.entries(s.lostByReason).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  return (
    <div>
      <PageHero theme={theme} icon={HardHat} title="Safety & Site Log" subtitle={`${project.name} — incidents, weather and hours lost on site`}
        tickerItems={[`${s.total} incident${s.total === 1 ? "" : "s"} logged`, s.daysSince !== null ? `${s.daysSince} day${s.daysSince === 1 ? "" : "s"} since the last incident` : "No incident logged", `${s.lostTotal} working hours lost (from daily reports)`]}
        right={<div style={{ display: "flex", gap: 6 }}>
          <Button theme={theme} small kind={tab === "incidents" ? "primary" : "ghost"} onClick={() => setTab("incidents")}>Safety incidents</Button>
          <Button theme={theme} small kind={tab === "weather" ? "primary" : "ghost"} onClick={() => setTab("weather")}>Weather & delay log</Button>
        </div>} />
      {tab === "incidents" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
            <StatTile theme={theme} label="Days since last incident" value={s.daysSince === null ? "—" : s.daysSince} sub={s.last ? `Last on ${fmtDMY(s.last)}` : "Nothing logged yet"} />
            <StatTile theme={theme} label="Total / open" value={`${s.total} / ${s.open.length}`} sub="Incidents logged / still open" color={s.open.length ? theme.accent : theme.text} />
            <StatTile theme={theme} label="Lost-time injuries" value={s.lti} sub="All time" color={s.lti ? theme.red : theme.text} />
            <StatTile theme={theme} label="Per 10,000 man-days" value={s.rate === null ? "—" : s.rate} sub={s.manDays ? `Based on ${s.manDays.toLocaleString()} reported man-days` : "Needs daily worker reports"} />
          </div>
          <Card theme={theme} style={{ marginBottom: 12 }}>
            <SectionTitle theme={theme} title="Log an incident" sub="Near misses count too — they are the early warning" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Field theme={theme} label="Date"><input type="date" max={today} style={inputStyle} className="bs-input-focus" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
              <Field theme={theme} label="Type"><select style={inputStyle} className="bs-input-focus" value={f.type} onChange={e => set("type", e.target.value)}>{INCIDENT_TYPES.map(x => <option key={x}>{x}</option>)}</select></Field>
              <Field theme={theme} label="Severity"><select style={inputStyle} className="bs-input-focus" value={f.severity} onChange={e => set("severity", e.target.value)}>{INCIDENT_SEVERITY.map(x => <option key={x}>{x}</option>)}</select></Field>
              <Field theme={theme} label="Contractor (optional)">
                <input list="trk-contractors-s" style={inputStyle} className="bs-input-focus" value={f.contractor} onChange={e => set("contractor", e.target.value)} />
                <datalist id="trk-contractors-s">{names.map(n => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field theme={theme} label="What happened *" style={{ gridColumn: "1 / -1" }}><input style={inputStyle} className="bs-input-focus" placeholder="Short description, location, action taken" value={f.description} onChange={e => set("description", e.target.value)} /></Field>
            </div>
            {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
            <div style={{ marginTop: 14 }}><Button theme={theme} icon={Plus} onClick={submit}>Log Incident</Button></div>
          </Card>
          <Card theme={theme}>
            <SectionTitle theme={theme} title="Incident register" sub="Most recent first" />
            {s.sorted.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No incidents logged.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.sorted.map(i => (
                  <div key={i.id} style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 12, border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "10px 12px", background: theme.panelAlt }}>
                    <StatusBadge theme={theme} status={i.severity === "Minor" ? "Medium" : i.severity === "Major" ? "High" : "Critical"} />
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: theme.text }}>{i.type} <span style={{ fontWeight: 600, color: theme.textMuted }}>· {fmtDMY(i.date)}{i.contractor ? ` · ${i.contractor}` : ""}</span></div>
                      <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{i.description}</div>
                    </div>
                    <Button theme={theme} small kind="ghost" onClick={() => onUpdateIncident(i.id, { status: i.status === "Closed" ? "Open" : "Closed" })}>{i.status === "Closed" ? "Reopen" : "Mark closed"}</Button>
                    <span style={{ fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 700, color: i.status === "Closed" ? theme.green : theme.accent, width: 46 }}>{i.status}</span>
                    <IconBtn theme={theme} icon={Trash2} title="Delete incident" onClick={() => onDeleteIncident(i.id)} />
                  </div>))}
              </div>)}
          </Card>
        </>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
            <StatTile theme={theme} label="Working hours lost" value={s.lostTotal} sub="Sum of 'hours lost' in daily reports" color={s.lostTotal ? theme.accent : theme.text} />
            <StatTile theme={theme} label="Rain days" value={rainy} sub="Days reported as light or heavy rain" />
            <StatTile theme={theme} label="Days with weather noted" value={Object.values(s.weatherDays).reduce((a, b) => a + b, 0)} sub={`Out of ${trk.actuals.length} daily report${trk.actuals.length === 1 ? "" : "s"}`} />
          </div>
          {logDays.length === 0 ? (
            <EmptyState theme={theme} icon={CloudSun} title="No weather or lost-hours data yet" text="Weather and hours lost are entered in the daily report. Add them there and this log, the charts and the delay analysis fill in automatically."
              action={<Button theme={theme} icon={ArrowRight} onClick={() => setView("planactual")}>Go to daily report</Button>} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Card theme={theme}><SectionTitle theme={theme} title="Hours lost by weather" />
                  {lostW.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No lost hours tagged with a weather condition.</div> : (
                    <div style={{ height: 200 }}><LoopRC><BarChart data={lostW}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" /><XAxis dataKey="name" {...chartAxis(theme)} /><YAxis {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} /><Bar isAnimationActive={false} dataKey="hours" name="Hours lost" fill={theme.accent} radius={[4, 4, 0, 0]} /></BarChart></LoopRC></div>)}</Card>
                <Card theme={theme}><SectionTitle theme={theme} title="Hours lost by delay reason" />
                  {lostR.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No lost hours tagged with a reason.</div> : (
                    <div style={{ height: 200 }}><LoopRC><BarChart data={lostR} layout="vertical"><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" /><XAxis type="number" {...chartAxis(theme)} /><YAxis type="category" dataKey="name" width={130} {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} /><Bar isAnimationActive={false} dataKey="hours" name="Hours lost" fill={theme.red} radius={[0, 4, 4, 0]} /></BarChart></LoopRC></div>)}</Card>
              </div>
              <Card theme={theme}>
                <SectionTitle theme={theme} title="Daily site log" sub={`${logDays.length} day${logDays.length === 1 ? "" : "s"} with weather or lost hours`} />
                <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Date", "Weather", "Hours lost", "Reason", "Remarks"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{logDays.slice(0, 60).map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                      <td style={td}>{fmtDMY(e.date)}</td><td style={{ ...td, fontFamily: FONT_UI }}>{e.weather || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: e.hoursLost > 0 ? theme.accent : theme.textMuted }}>{e.hoursLost > 0 ? e.hoursLost : "—"}</td>
                      <td style={{ ...td, fontFamily: FONT_UI }}>{e.reason || "—"}</td><td style={{ ...td, fontFamily: FONT_UI, color: theme.textMuted }}>{e.remarks}</td></tr>))}</tbody></table></div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}


/* =========================================================================
   TOP-BAR RISK ALERT (health from real data)
   ========================================================================= */
function ProjectRiskAlert({ theme, summary, setView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const h = summary.health;
  const level = h.level === "Critical" ? "critical" : h.level === "At Risk" ? "atRisk" : "healthy";
  const col = { healthy: theme.green, atRisk: theme.warn, critical: theme.red }[level];
  const counts = { Critical: 0, High: 0, Medium: 0 };
  summary.alerts.forEach(a => { counts[a.severity] += 1; });
  const flagged = level !== "healthy" || counts.Critical > 0;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} title="Project health" style={{
        width: 34, height: 34, borderRadius: 999, border: `1px solid ${flagged ? col : theme.border}`,
        background: flagged ? hexAlpha(col, 0.14) : "transparent", cursor: "pointer", display: "grid", placeItems: "center", position: "relative", flexShrink: 0,
      }}>
        <AlertTriangle size={16} color={flagged ? col : theme.textFaint} />
        {summary.alerts.length > 0 && <span style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: col, border: `2px solid ${theme.bg}` }} />}
      </button>
      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 330, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, zIndex: 40, boxShadow: "0 16px 40px #00000038", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${theme.borderSoft}` }}>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13.5, color: theme.text }}>
              Project health — {h.level || "not enough data"}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
              {h.score === null ? "Enter plan and actual data to calculate" : `Score ${h.score} / 100 · from ${h.parts.length} signal${h.parts.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div style={{ padding: "12px 16px 14px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[["Critical", theme.red], ["High", theme.warn], ["Medium", theme.blue]].map(([k, c]) => (
                <div key={k} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 3, background: theme.panelAlt, border: `1px solid ${theme.borderSoft}` }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: counts[k] ? c : theme.textMuted }}>{counts[k]}</div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 10, color: theme.textFaint, marginTop: 2 }}>{k}</div>
                </div>))}
            </div>
            {summary.alerts.slice(0, 3).map(a => (
              <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 3, background: theme.panelAlt, marginBottom: 6 }}>
                <StatusBadge status={a.severity} theme={theme} />
                <span style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
              </div>))}
            {summary.alerts.length === 0 && <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted }}>No alerts from the data entered so far.</div>}
            <button onClick={() => { setView("delays"); setOpen(false); }} style={{
              width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 3, border: "none", cursor: "pointer", background: theme.accent, color: theme.onAccent,
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>Open Delay Detection <ChevronRight size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   EMPTY WORKSPACE + EDIT PROJECT
   ========================================================================= */
function NoProjectScreen({ theme, onAddProject, onLoadDemo, onLoadAyodhya, onLoadSultanganj }) {
  return (
    <div style={{ paddingTop: 40 }}>
      <EmptyState theme={theme} icon={Building2} title="No project yet"
        text="Add your first project with its planned schedule, workers and machines. Every page then shows only what you plan and what you actually report. Or load the demo project to see every page filled with sample data."
        action={<div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}><Button theme={theme} icon={Plus} onClick={onAddProject}>Add Project</Button>{onLoadDemo && <Button theme={theme} kind="subtle" icon={Sparkles} onClick={() => onLoadDemo()}>Load Demo Project</Button>}{onLoadAyodhya && <Button theme={theme} kind="subtle" icon={Sparkles} onClick={() => onLoadAyodhya()}>Northern Ayodhya Bypass demo</Button>}{onLoadSultanganj && <Button theme={theme} kind="subtle" icon={Sparkles} onClick={() => onLoadSultanganj()}>Aguwani–Sultanganj Bridge demo</Button>}</div>} />
    </div>
  );
}

function EditProjectModal({ theme, project, onClose, onSave }) {
  const inputStyle = trkInput(theme);
  const [f, setF] = useState({ name: project.name, client: project.client === "—" ? "" : project.client, contractor: project.contractor === "—" ? "" : project.contractor, pm: project.pm === "—" ? "" : project.pm, value: project.value === "—" ? "" : project.value });
  const [error, setError] = useState("");
  const fields = [["name", "Project name *"], ["client", "Client *"], ["contractor", "Main contractor"], ["pm", "Project manager"], ["value", "Contract value"]];
  const submit = () => {
    if (!f.name.trim() || !f.client.trim()) return setError("Project name and client are required.");
    onSave({ name: f.name.trim(), client: f.client.trim(), contractor: f.contractor.trim() || "—", pm: f.pm.trim() || "—", value: f.value.trim() || "—" });
  };
  return (
    <Modal theme={theme} title="Edit project details" onClose={onClose} width={560}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {fields.map(([k, l]) => (
          <Field key={k} theme={theme} label={l} style={k === "name" ? { gridColumn: "1 / -1" } : undefined}>
            <input style={inputStyle} className="bs-input-focus" value={f[k]} onChange={e => { setF(x => ({ ...x, [k]: e.target.value })); setError(""); }} />
          </Field>))}
      </div>
      {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}><Button theme={theme} icon={Check} onClick={submit}>Save</Button><Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button></div>
    </Modal>
  );
}

/* =========================================================================
   PERIOD COMPARISON — daily / weekly / monthly planned vs actual + delay
   ========================================================================= */
function PeriodComparison({ theme, summary: s }) {
  const [mode, setMode] = useState("weekly");
  const today = todayISO();
  const P = useMemo(() => buildPeriods(s, mode, today), [s, mode, today]);
  const th = thStyle(theme), td = tdStyle(theme);
  const unit = { daily: "day", weekly: "week", monthly: "month" }[mode];
  const B = P.buckets;
  const cur = B.length ? B[B.length - 1] : null;
  const prev = B.length > 1 ? B[B.length - 2] : null;
  const money = (v) => (v === null || v === undefined ? "—" : fmtMoney(v));
  const modeBar = (
    <div style={{ display: "flex", gap: 6 }}>
      {[["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([k, l]) => (
        <Button key={k} theme={theme} small kind={mode === k ? "primary" : "ghost"} onClick={() => setMode(k)}>{l}</Button>))}
    </div>
  );
  if (!B.length) {
    return (
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Planned vs actual by period" sub="Compare each day, week or month with the plan and see where delay starts" right={modeBar} />
        <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>
          {P.reason === "no-plan" ? "Add the planned data for this project to compare periods." : P.reason === "not-started" ? "The planned start date hasn't arrived yet, so there is no period to compare." : "No period to show yet."}
        </div>
      </Card>);
  }
  const delayText = (b) => (b.delay === null ? "No progress % reported yet" : b.delay > 0 ? `${b.delay} day${b.delay === 1 ? "" : "s"} behind plan` : b.delay < 0 ? `${-b.delay} day${b.delay === -1 ? "" : "s"} ahead of plan` : "on plan");
  const dColor = (v) => (v === null || v === undefined || v === 0 ? theme.textMuted : v > 0 ? theme.red : theme.green);
  const madeColor = cur && cur.actualMade !== null && cur.actualMade < cur.plannedMade - 0.05 ? theme.red : theme.text;
  const chartData = B.map(b => ({ ...b, delayDays: b.delay }));
  const hasSpend = B.some(b => b.spendActual > 0 || (b.spendPlanned || 0) > 0);
  const chartBox = (title, sub, children) => (
    <Card theme={theme}><SectionTitle theme={theme} title={title} sub={sub} /><div style={{ width: "100%", height: 220 }}><LoopRC>{children}</LoopRC></div></Card>);
  const axisX = <XAxis dataKey="label" interval="preserveStartEnd" {...chartAxis(theme)} />;
  const grid = <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />;
  const legend = <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />;
  return (
    <div style={{ marginBottom: 12 }}>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Planned vs actual by period" sub={`Each ${unit} is compared with the plan using the entries you made. Choose daily, weekly or monthly.`} right={modeBar} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "11px 14px", background: theme.panelAlt }}>
          {cur.status ? <StatusBadge theme={theme} status={cur.status} /> : <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }}>No status</span>}
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, flex: 1 }}>
            <b>{cur.label}</b> (latest {unit}): {cur.actualEnd === null ? "no cumulative progress reported yet." : <>actual <b>{cur.actualEnd}%</b> vs planned <b>{cur.plannedEnd}%</b> at the end of the {unit} — <b style={{ color: dColor(cur.delay) }}>{delayText(cur)}</b>.</>}
            {cur.stale && <span style={{ color: theme.accent }}> No report was entered in this {unit}; the last known progress is used.</span>}
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label={`Progress made this ${unit}`} value={cur.actualMade === null ? "—" : `${cur.actualMade}%`} sub={`Planned ${cur.plannedMade}%${prev && prev.actualMade !== null ? ` · last ${unit}: ${prev.actualMade}% vs ${prev.plannedMade}% planned` : ""}`} color={madeColor} />
        <StatTile theme={theme} label="Cumulative variance" value={cur.variance === null ? "—" : `${signedNum(cur.variance)} pts`} sub={prev && prev.variance !== null ? `Previous ${unit}: ${signedNum(prev.variance)} pts` : "Actual minus planned at period end"} color={cur.variance !== null && cur.variance <= -2 ? theme.red : theme.text} />
        <StatTile theme={theme} label={`Workforce (avg / day)`} value={cur.actualWorkers === null ? "—" : `${cur.actualWorkers} vs ${cur.plannedWorkers === null ? "—" : cur.plannedWorkers}`} sub={`Machines ${cur.actualMachines === null ? "—" : cur.actualMachines} vs ${cur.plannedMachines === null ? "—" : cur.plannedMachines} · ${cur.hoursLost} h lost`} color={cur.actualWorkers !== null && cur.plannedWorkers && cur.actualWorkers < cur.plannedWorkers * 0.9 ? theme.red : theme.text} />
        <StatTile theme={theme} label={`Spend this ${unit}`} value={money(cur.spendActual)} sub={cur.spendPlanned === null ? "No budget in plan to compare" : `Planned ${money(cur.spendPlanned)}`} color={cur.spendPlanned !== null && cur.spendActual > cur.spendPlanned * 1.1 ? theme.red : theme.text} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {chartBox("Cumulative progress at period end", "Planned vs actual %", (
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>{grid}{axisX}<YAxis domain={[0, 100]} unit="%" {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} />{legend}
            <Line isAnimationActive={false} type="monotone" dataKey="plannedEnd" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="actualEnd" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls /></LineChart>))}
        {chartBox(`Progress made per ${unit}`, "Percentage points gained in each period", (
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>{grid}{axisX}<YAxis unit="%" {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} />{legend}
            <Bar isAnimationActive={false} dataKey="plannedMade" name="Planned" fill={theme.blue} radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="actualMade" name="Actual" fill={theme.accent} radius={[4, 4, 0, 0]} /></BarChart>))}
        {chartBox("Delay at period end", "Days behind plan (below zero = ahead)", (
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>{grid}{axisX}<YAxis allowDecimals={false} {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} />
            <Bar isAnimationActive={false} dataKey="delayDays" name="Days behind" fill={theme.red} radius={[4, 4, 0, 0]} /></BarChart>))}
        {chartBox("Workers and machines (avg per working day)", "Planned vs actual", (
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>{grid}{axisX}<YAxis allowDecimals={false} {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} />{legend}
            <Line isAnimationActive={false} type="monotone" dataKey="plannedWorkers" name="Workers (plan)" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="actualWorkers" name="Workers (actual)" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            <Line isAnimationActive={false} type="monotone" dataKey="plannedMachines" name="Machines (plan)" stroke={theme.green} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="actualMachines" name="Machines (actual)" stroke={theme.red} strokeWidth={2.5} dot={{ r: 3 }} connectNulls /></LineChart>))}
      </div>
      {hasSpend && (
        <div style={{ marginBottom: 12 }}>
          {chartBox(`Spend per ${unit}`, "Planned spend follows the monthly progress targets × budget", (
            <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 6 }}>{grid}{axisX}<YAxis tickFormatter={(v) => fmtMoney(v)} {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} formatter={(v) => fmtMoney(v)} />{legend}
              <Bar isAnimationActive={false} dataKey="spendPlanned" name="Planned" fill={theme.blue} radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="spendActual" name="Actual" fill={theme.accent} radius={[4, 4, 0, 0]} /></BarChart>))}
        </div>)}
      <Card theme={theme}>
        <SectionTitle theme={theme} title={`${unit[0].toUpperCase() + unit.slice(1)}-by-${unit} comparison`} sub={mode === "daily" ? "Last 31 days" : mode === "weekly" ? "Last 16 weeks (Monday to Sunday)" : "All months since the start"} />
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>
            {["Period", "Reports", "Plan %", "Actual %", "Δ pts", "Delay", "Status", "Made (plan / actual)", "Workers (plan / actual)", "Machines (plan / actual)", "Hrs lost", "Spend (plan / actual)", "Incidents"].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>{[...B].reverse().map(b => (
            <tr key={b.from} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
              <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{b.label}</td>
              <td style={{ ...td, color: b.reports === 0 ? theme.accent : theme.text }}>{b.reports}</td>
              <td style={td}>{b.plannedEnd}%</td><td style={{ ...td, fontWeight: 700 }}>{b.actualEnd === null ? "—" : `${b.actualEnd}%`}</td>
              <td style={{ ...td, color: b.variance === null ? theme.textMuted : b.variance < 0 ? theme.red : theme.green, fontWeight: 700 }}>{signedNum(b.variance)}</td>
              <td style={{ ...td, color: dColor(b.delay), fontWeight: 700 }}>{b.delay === null ? "—" : b.delay > 0 ? `${b.delay}d behind` : b.delay < 0 ? `${-b.delay}d ahead` : "on plan"}</td>
              <td style={td}>{b.status ? <StatusBadge theme={theme} status={b.status} /> : "—"}</td>
              <td style={td}>{b.plannedMade}% / {b.actualMade === null ? "—" : `${b.actualMade}%`}</td>
              <td style={td}>{b.plannedWorkers === null ? "—" : b.plannedWorkers} / {b.actualWorkers === null ? "—" : b.actualWorkers}</td>
              <td style={td}>{b.plannedMachines === null ? "—" : b.plannedMachines} / {b.actualMachines === null ? "—" : b.actualMachines}</td>
              <td style={td}>{b.hoursLost || "—"}</td>
              <td style={td}>{b.spendPlanned === null ? "—" : money(b.spendPlanned)} / {b.spendActual ? money(b.spendActual) : "—"}</td>
              <td style={{ ...td, color: b.incidents ? theme.accent : theme.textMuted }}>{b.incidents || "—"}</td>
            </tr>))}</tbody></table></div>
        <div style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, lineHeight: 1.5 }}>
          Progress at a period end is the latest cumulative % you reported up to that date; a period with 0 reports reuses the last known value, and progress made before your first report is counted in the period of that first report. Delay = calendar days between when the plan expected that progress and the period end. Workers and machines average only reported planned working days.
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   DASHBOARD — only the selected project's entered data
   ========================================================================= */

/* =========================================================================
   MOBILE: bottom navigation, offline strip, install button
   ========================================================================= */
/* =========================================================================
   LANGUAGE BUTTON + DAILY REPORT REMINDER
   ========================================================================= */
function LangToggle({ theme }) {
  const [lang, setLang] = useState(i18nLang());
  return <Button theme={theme} small kind="subtle" title="Language" onClick={() => { const n = lang === "hi" ? "en" : "hi"; i18nSet(n); setLang(n); }}>{lang === "hi" ? "EN" : "हिं"}</Button>;
}
const REM_KEY = "bs-reminder", REM_LAST = "bs-reminder-last", REM_HIDE = "bs-reminder-hide";
function readReminder() {
  try { const v = JSON.parse(localStorage.getItem(REM_KEY) || "null"); if (v && typeof v.on === "boolean") return { on: v.on, time: /^\d\d:\d\d$/.test(v.time) ? v.time : "18:00" }; } catch (e) {}
  return { on: false, time: "18:00" };
}
function writeReminder(v) { try { localStorage.setItem(REM_KEY, JSON.stringify(v)); } catch (e) {} window.dispatchEvent(new Event("bs-reminder-change")); }
async function showReminderNotification(title, body) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: "/icon-192.png", tag: "bs-daily-report" });
    else new Notification(title, { body, tag: "bs-daily-report" });
    return true;
  } catch (e) { return false; }
}
function ReminderMenu({ theme }) {
  const [open, setOpen] = useState(false), [rem, setRem] = useState(readReminder), [msg, setMsg] = useState("");
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const save = (n) => { setRem(n); writeReminder(n); };
  const ask = async () => { if (typeof Notification === "undefined") return; try { setPerm(await Notification.requestPermission()); } catch (e) {} };
  const toggle = async () => { const n = { ...rem, on: !rem.on }; save(n); if (n.on && perm === "default") await ask(); };
  const note = perm === "granted" ? "Notifications are on." : perm === "denied" ? "Notifications are blocked in this browser. Allow them in the site settings." : perm === "unsupported" ? "Notifications are not supported here. You will still see the reminder inside the app." : "";
  return (
    <div>
      <IconBtn theme={theme} icon={Clock} active={rem.on} title="Daily report reminder" onClick={() => setOpen(!open)} />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120 }} />
          <div style={{ position: "fixed", top: 64, right: 16, zIndex: 121, width: "min(300px, calc(100vw - 32px))", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, padding: 14, boxShadow: "0 16px 40px rgba(0,0,0,.3)", fontFamily: FONT_UI }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: theme.text }}>Daily report reminder</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>Remind me</span>
              <button onClick={toggle} role="switch" aria-checked={rem.on} aria-label="Remind me" style={{ width: 44, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: rem.on ? theme.accent : theme.border, position: "relative", minHeight: 0 }}>
                <span style={{ position: "absolute", top: 3, left: rem.on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff" }} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
              <span style={{ fontSize: 13, color: theme.text, fontWeight: 600 }}>Remind me at</span>
              <input type="time" value={rem.time} onChange={(e) => e.target.value && save({ ...rem, time: e.target.value })} style={{ border: `1px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, borderRadius: 3, padding: "6px 8px", fontFamily: FONT_MONO, fontSize: 13 }} />
            </div>
            {note && <div style={{ fontSize: 12, color: perm === "denied" ? theme.red : theme.textMuted, marginTop: 10, lineHeight: 1.5 }}>{note}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {perm === "default" && <Button theme={theme} small onClick={ask}>Allow notifications</Button>}
              {perm === "granted" && <Button theme={theme} small kind="subtle" onClick={async () => { const ok = await showReminderNotification("Daily report pending", "This is a test reminder from InfraTrack."); setMsg(ok ? "Test notification sent." : ""); }}>Send test</Button>}
            </div>
            {msg && <div style={{ fontSize: 12, color: theme.green, marginTop: 8 }}>{msg}</div>}
            <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 12, lineHeight: 1.5 }}>Works while InfraTrack is open in a browser tab or installed as an app. Alerts when the app is fully closed need a push server, which isn't set up.</div>
          </div>
        </>)}
    </div>);
}
function ReminderWatcher({ theme, project, summary, setView }) {
  const [rem, setRem] = useState(readReminder), [, setTick] = useState(0);
  const [hide, setHide] = useState(() => { try { return localStorage.getItem(REM_HIDE) || ""; } catch (e) { return ""; } });
  useEffect(() => {
    const f = () => setRem(readReminder()), t = () => setTick((x) => x + 1), iv = setInterval(t, 30000);
    window.addEventListener("bs-reminder-change", f); window.addEventListener("focus", t); document.addEventListener("visibilitychange", t);
    return () => { clearInterval(iv); window.removeEventListener("bs-reminder-change", f); window.removeEventListener("focus", t); document.removeEventListener("visibilitychange", t); };
  }, []);
  const today = todayISO(), now = new Date(), hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const applicable = !!(project && summary && summary.tr);
  const filled = applicable && summary.tr.rows.some((r) => r.date === today);
  const due = applicable && rem.on && hhmm >= rem.time && !filled;
  const key = `${today}|${project ? project.id : ""}`;
  useEffect(() => {
    if (!due) return;
    let last = ""; try { last = localStorage.getItem(REM_LAST) || ""; } catch (e) {}
    if (last === key) return;
    try { localStorage.setItem(REM_LAST, key); } catch (e) {}
    showReminderNotification("Daily report pending", `Today's report for ${project.name} isn't filled yet.`);
  }, [due, key]);
  if (!due || hide === key) return null;
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 16px", background: hexAlpha(theme.accent, 0.16), borderBottom: `1px solid ${theme.accent}`, fontFamily: FONT_UI, fontSize: 13, fontWeight: 700, color: theme.text }}>
      <span style={{ flex: 1, minWidth: 180 }}>Daily report pending: {project.name}</span>
      <Button theme={theme} small onClick={() => setView("planactual")}>Add report</Button>
      <Button theme={theme} small kind="subtle" onClick={() => { setHide(key); try { localStorage.setItem(REM_HIDE, key); } catch (e) {} }}>Later</Button>
    </div>);
}
function BottomNav({ theme: _pageTheme, view, setView }) {
  const theme = NAV_THEME;
  const [more, setMore] = useState(false);
  const main = ["dashboard", "dataentry", "planactual", "activities"].map((id) => NAV.find((n) => n.id === id)).filter(Boolean);
  const tab = (n, active, onClick) => (
    <button key={n.id} onClick={onClick} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 2px", border: "none", background: "transparent", cursor: "pointer", color: active ? theme.accent : theme.textMuted, fontFamily: FONT_UI, fontSize: 10.5, fontWeight: 700 }}>
      <n.icon size={20} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{n.short || n.label.replace(/ \(.*\)/, "").split(" ")[0]}</span>
    </button>);
  return (
    <div className="no-print">
      {more && (
        <div onClick={() => setMore(false)} style={{ position: "fixed", inset: 0, zIndex: 140, background: "#000000aa" }}>
          <div onClick={(e) => e.stopPropagation()} className="bs-keep-grid" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "75vh", overflowY: "auto", background: theme.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "16px 14px calc(84px + env(safe-area-inset-bottom, 0px))", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => { setView(n.id); setMore(false); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 3, cursor: "pointer", border: `1px solid ${view === n.id ? theme.accent : theme.border}`, background: view === n.id ? theme.accentSoft : theme.panelAlt, color: theme.text, fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 700, textAlign: "center", minHeight: 76 }}>
                <n.icon size={22} color={view === n.id ? theme.accent : theme.textMuted} />{n.label}
              </button>))}
          </div>
        </div>)}
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 150, display: "flex", background: theme.panel, borderTop: `1px solid ${theme.border}`, padding: "2px 4px calc(2px + env(safe-area-inset-bottom, 0px))" }}>
        {main.map((n) => tab(n, view === n.id, () => { setView(n.id); setMore(false); }))}
        {tab({ id: "more", label: "More", icon: LayoutGrid }, more, () => setMore(!more))}
      </nav>
    </div>);
}
function OfflineStrip({ theme }) {
  const [on, setOn] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => { const u = () => setOn(true), d = () => setOn(false); window.addEventListener("online", u); window.addEventListener("offline", d); return () => { window.removeEventListener("online", u); window.removeEventListener("offline", d); }; }, []);
  if (on) return null;
  return <div role="status" style={{ padding: "8px 16px", background: hexAlpha(theme.accent, 0.18), borderBottom: `1px solid ${theme.accent}`, fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text }}>You’re offline. Entries are still saved in this browser; cloud sync resumes when you’re back online.</div>;
}
function InstallButton({ theme }) {
  const [evt, setEvt] = useState(null);
  useEffect(() => { const h = (e) => { e.preventDefault(); setEvt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  if (!evt) return null;
  return <IconBtn theme={theme} icon={Download} title="Install InfraTrack as an app" onClick={async () => { evt.prompt(); try { await evt.userChoice; } catch (e) {} setEvt(null); }} />;
}

/* =========================================================================
   GANTT / TIMELINE
   ========================================================================= */
function GanttPage({ theme, project, summary: s, setView }) {
  const [zoom, setZoom] = useState(5);
  const rows = s.act ? s.act.rows : [];
  if (!rows.length) return (
    <div>
      <SectionTitle theme={theme} title="Timeline (Gantt)" sub={project.name} />
      <EmptyState theme={theme} icon={CalendarDays} title="No activities yet" text="Add activities with start and finish dates and log progress. The timeline draws itself from them." action={<Button theme={theme} onClick={() => setView("activities")}>Go to Activities</Button>} />
    </div>);
  const today = todayISO();
  const col = { Completed: theme.green, Ahead: theme.green, "On Track": theme.blue, "At Risk": theme.warn, Delayed: theme.red, "Not started": theme.textFaint };
  const lo = [...rows.map((r) => r.start), ...(s.plan ? [s.plan.startDate] : [])].sort()[0];
  const hi = [...rows.map((r) => r.end), ...(s.plan ? [s.plan.endDate] : [])].sort().slice(-1)[0];
  const span = diffDays(lo, hi) + 1, X = (d) => diffDays(lo, d) * zoom, W = span * zoom + 150, RH = 42, HH = 34;
  const months = []; for (let d = lo.slice(0, 7) + "-01"; d <= hi; d = addDays(d, 32).slice(0, 7) + "-01") months.push(d);
  const todayIn = today >= lo && today <= hi;
  const zbtn = (v, l) => <button key={v} onClick={() => setZoom(v)} style={{ cursor: "pointer", border: `1px solid ${zoom === v ? theme.accent : theme.border}`, background: zoom === v ? theme.accentSoft : theme.panelAlt, color: theme.text, borderRadius: 3, padding: "6px 12px", fontFamily: FONT_UI, fontSize: 12, fontWeight: 700 }}>{l}</button>;
  return (
    <div>
      <SectionTitle theme={theme} title="Timeline (Gantt)" sub={`${project.name} · planned bars with actual progress filled in`} right={<div style={{ display: "flex", gap: 6 }}>{zbtn(2.5, "Compact")}{zbtn(5, "Normal")}{zbtn(10, "Wide")}</div>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Activities" value={rows.length} />
        <StatTile theme={theme} label="Delayed" value={s.act.counts["Delayed"] || 0} color={(s.act.counts["Delayed"] || 0) ? theme.red : theme.text} />
        <StatTile theme={theme} label="At risk" value={s.act.counts["At Risk"] || 0} color={(s.act.counts["At Risk"] || 0) ? theme.warn : theme.text} />
        <StatTile theme={theme} label="Completed" value={s.act.counts["Completed"] || 0} color={theme.green} />
      </div>
      <Card theme={theme} style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: 190, flexShrink: 0, borderRight: `1px solid ${theme.border}` }}>
            <div style={{ height: HH, borderBottom: `1px solid ${theme.border}`, padding: "0 12px", display: "flex", alignItems: "center", fontFamily: FONT_UI, fontSize: 11, fontWeight: 700, color: theme.textFaint }}>ACTIVITY</div>
            {rows.map((r) => (
              <div key={r.id} style={{ height: RH, padding: "0 12px", borderBottom: `1px solid ${theme.borderSoft}`, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: col[r.status] || theme.textMuted }}>{r.status}</div>
              </div>))}
          </div>
          <div style={{ overflowX: "auto", flex: 1 }}>
            <div style={{ position: "relative", width: W, height: HH + rows.length * RH }}>
              {months.map((m) => (
                <div key={m} style={{ position: "absolute", left: Math.max(0, X(m)), top: 0, bottom: 0, borderLeft: `1px solid ${theme.borderSoft}` }}>
                  <div style={{ height: HH, display: "flex", alignItems: "center", paddingLeft: 6, fontFamily: FONT_MONO, fontSize: 10.5, color: theme.textFaint, whiteSpace: "nowrap" }}>{new Date(m + "T00:00:00").toLocaleString("en-IN", { month: "short", year: "2-digit" })}</div>
                </div>))}
              <div style={{ position: "absolute", left: 0, right: 0, top: HH, borderTop: `1px solid ${theme.border}` }} />
              {rows.map((r, i) => {
                const c = col[r.status] || theme.textFaint, len = Math.max(zoom, (diffDays(r.start, r.end) + 1) * zoom), top = HH + i * RH;
                return (
                  <div key={r.id}>
                    <div style={{ position: "absolute", left: 0, right: 0, top: top + RH - 1, borderBottom: `1px solid ${theme.borderSoft}` }} />
                    <div className="bs-gbar" title={`${r.name}: ${fmtDMY(r.start)} to ${fmtDMY(r.end)} · actual ${r.actualPct}% vs planned ${r.plannedPct}% by today`} style={{ position: "absolute", left: X(r.start), top: top + 10, width: len, height: 22, borderRadius: 3, border: `1px solid ${c}`, background: hexAlpha(c, 0.16), animationDelay: `${i * 50}ms`, overflow: "hidden" }}>
                      <div style={{ width: `${clamp(r.actualPct, 0, 100)}%`, height: "100%", background: c, borderRadius: 3 }} />
                      {!r.complete && r.plannedPct > 0 && <div style={{ position: "absolute", left: `${clamp(r.plannedPct, 0, 100)}%`, top: 0, bottom: 0, width: 2, background: theme.text, opacity: 0.7 }} />}
                    </div>
                    <div style={{ position: "absolute", left: X(r.start) + len + 8, top: top + 13, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: theme.textMuted, whiteSpace: "nowrap" }}>
                      {r.actualPct}%{r.delayDays > 0 && <span style={{ color: theme.red }}> · {r.delayDays}d late</span>}
                    </div>
                  </div>);
              })}
              {todayIn && (
                <div className="bs-today" style={{ position: "absolute", left: X(today), top: 0, bottom: 0, borderLeft: `2px solid ${theme.accent}`, zIndex: 3 }}>
                  <span style={{ position: "absolute", top: 2, left: 4, fontFamily: FONT_MONO, fontSize: 10, fontWeight: 800, color: theme.accent, background: theme.panel, padding: "0 4px", borderRadius: 4 }}>TODAY</span>
                </div>)}
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }}>
        <span>Light bar = planned dates · solid fill = actual progress · vertical tick = where progress should be today</span>
        {[["Completed / ahead", theme.green], ["On track", theme.blue], ["At risk", theme.warn], ["Delayed", theme.red]].map(([l, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>)}
      </div>
    </div>);
}

/* =========================================================================
   ONE-CLICK REPORT: PDF with graphs drawn natively, and an Excel workbook
   ========================================================================= */
const pdfSafe = (t) => String(t === null || t === undefined ? "" : t).replace(/₹/g, "Rs ").replace(/[−–]/g, "-").replace(/[^\x20-\xFF]/g, "");
async function buildReportPdf(project, s) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), mx = 40, cw = W - mx * 2;
  const C = { navy: "#0F1B2D", amber: "#D98A12", blue: "#2F6FDE", green: "#1C8A56", red: "#C43F3F", grey: "#7A8396" };
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const fill = (h) => doc.setFillColor(...rgb(h)), stroke = (h) => doc.setDrawColor(...rgb(h)), ink = (h) => doc.setTextColor(...rgb(h));
  const txt = (t, x, y, o) => doc.text(pdfSafe(t), x, y, o);
  const font = (st, size) => { doc.setFont("helvetica", st); doc.setFontSize(size); };
  const money = (v) => (v === null || v === undefined ? "-" : fmtMoney(v));
  const val = (v) => (v === null || v === undefined ? "-" : String(v));
  const stColor = { Completed: C.green, Ahead: C.green, "On Track": C.blue, "At Risk": C.amber, Delayed: C.red, "Not started": C.grey };
  let y = 0;
  const ensure = (h) => { if (y + h > 790) { doc.addPage(); y = 48; } };
  const heading = (t) => { ensure(44); font("bold", 12); ink(C.amber); txt(t, mx, y); y += 8; stroke("#DDE1E8"); doc.setLineWidth(0.6); doc.line(mx, y, W - mx, y); y += 18; };

  fill(C.navy); doc.rect(0, 0, W, 84, "F"); fill(C.amber); doc.rect(0, 84, W, 3, "F");
  ink("#FFFFFF"); font("bold", 19); txt("InfraTrack  |  Project Report", mx, 36);
  font("normal", 11); ink("#C9D2E3"); txt(project.name, mx, 56);
  txt(`Generated ${fmtDMY(todayISO())}${s.plan ? `   |   Plan ${fmtDMY(s.plan.startDate)} to ${fmtDMY(s.plan.endDate)}` : ""}`, mx, 72);
  y = 112;

  const c = s.cost || {};
  const kp = [
    ["PROGRESS", s.progress.actual === null ? "-" : `${s.progress.actual}%`, s.progress.actual === null ? "no data yet" : `plan ${s.progress.planned}%`, C.blue],
    ["SCHEDULE", s.status || "-", s.delayDays > 0 ? `${s.delayDays} days behind` : s.aheadDays > 0 ? `${s.aheadDays} days ahead` : "on the planned curve", stColor[s.status] || C.grey],
    ["BUDGET USED", c.usedPct === null || c.usedPct === undefined ? "-" : `${c.usedPct}%`, c.CPI === null || c.CPI === undefined ? "" : `CPI ${c.CPI}`, C.amber],
    ["OPEN ALERTS", String(s.alerts.length), `${s.alerts.filter((a) => a.severity === "Critical").length} critical`, s.alerts.length ? C.red : C.green],
  ];
  const bw = (cw - 30) / 4;
  kp.forEach((k, i) => {
    const x = mx + i * (bw + 10);
    fill("#F3F5F9"); doc.roundedRect(x, y, bw, 62, 6, 6, "F"); fill(k[3]); doc.rect(x, y + 8, 3, 46, "F");
    ink(C.grey); font("bold", 8); txt(k[0], x + 12, y + 18); ink("#141A26"); font("bold", 17); txt(k[1], x + 12, y + 40); ink(C.grey); font("normal", 8.5); txt(k[2], x + 12, y + 54);
  });
  y += 88;

  heading("Progress curve: planned vs actual");
  const pts = s.tr ? s.tr.chartProgress : [], ch = 150, cx0 = mx + 30, cw2 = cw - 40;
  ensure(ch + 44);
  if (pts.length >= 2) {
    const maxX = Math.max(s.tr.totalDays || 1, ...pts.map((q) => q.x)) || 1;
    const px = (v) => cx0 + (v / maxX) * cw2, py = (v) => y + ch - (Math.min(100, Math.max(0, v)) / 100) * ch;
    font("normal", 7.5); ink(C.grey); stroke("#E3E6EC"); doc.setLineWidth(0.5);
    [0, 25, 50, 75, 100].forEach((g) => { doc.line(cx0, py(g), cx0 + cw2, py(g)); txt(`${g}%`, mx, py(g) + 2.5); });
    doc.setLineWidth(1.8); stroke(C.amber); doc.setLineDashPattern([5, 3], 0);
    for (let i = 1; i < pts.length; i++) doc.line(px(pts[i - 1].x), py(pts[i - 1].planned), px(pts[i].x), py(pts[i].planned));
    doc.setLineDashPattern([], 0); stroke(C.blue);
    const ap = pts.filter((q) => q.actual !== null && q.actual !== undefined);
    for (let i = 1; i < ap.length; i++) doc.line(px(ap[i - 1].x), py(ap[i - 1].actual), px(ap[i].x), py(ap[i].actual));
    ap.forEach((q) => { fill(C.blue); doc.circle(px(q.x), py(q.actual), 2, "F"); });
    doc.setLineWidth(0.6); font("normal", 8); ink(C.grey);
    txt("Day 0", cx0, y + ch + 12); txt(`Day ${maxX}`, cx0 + cw2, y + ch + 12, { align: "right" });
    stroke(C.amber); doc.setLineWidth(1.8); doc.setLineDashPattern([5, 3], 0); doc.line(cx0 + 90, y + ch + 9, cx0 + 112, y + ch + 9); doc.setLineDashPattern([], 0);
    txt("Planned", cx0 + 116, y + ch + 12); stroke(C.blue); doc.line(cx0 + 160, y + ch + 9, cx0 + 182, y + ch + 9); txt("Actual", cx0 + 186, y + ch + 12); doc.setLineWidth(0.6);
  } else { font("normal", 10); ink(C.grey); txt("Enter a plan and daily progress to draw the curve.", mx, y + 20); }
  y += ch + 32;

  const rows = s.act ? s.act.rows.slice().sort((a, b) => a.variance - b.variance).slice(0, 10) : [];
  if (rows.length) {
    heading("Activity progress (worst variance first)");
    const lw = 170, bx = mx + lw, bwid = cw - lw - 70;
    rows.forEach((r) => {
      ensure(26); const col = stColor[r.status] || C.grey;
      font("normal", 9); ink("#1A2030"); txt(doc.splitTextToSize(pdfSafe(r.name), lw - 8)[0], mx, y + 12);
      fill("#E8EBF1"); doc.rect(bx, y, bwid, 7, "F"); fill("#BFC6D3"); doc.rect(bx, y, (bwid * Math.min(100, r.plannedPct)) / 100, 7, "F");
      fill(col); doc.rect(bx, y + 9, (bwid * Math.min(100, r.actualPct)) / 100, 7, "F");
      font("bold", 8.5); ink(col); txt(`${r.actualPct}% / ${r.plannedPct}%`, bx + bwid + 6, y + 14);
      y += 22;
    });
    font("normal", 8); ink(C.grey); txt("Grey bar = planned by today, coloured bar = actual (colour shows status). Labels: actual / planned.", mx, y + 4); y += 24;

    heading("Activity status mix");
    ensure(54);
    const order = ["Completed", "Ahead", "On Track", "At Risk", "Delayed", "Not started"], tot = s.act.rows.length; let x = mx;
    order.forEach((k) => { const n = s.act.counts[k] || 0; if (!n) return; const w = (cw * n) / tot; fill(stColor[k]); doc.rect(x, y, w, 16, "F"); x += w; });
    y += 32; x = mx; font("normal", 8.5);
    order.forEach((k) => { const n = s.act.counts[k] || 0; if (!n) return; fill(stColor[k]); doc.rect(x, y - 7, 8, 8, "F"); ink("#1A2030"); txt(`${k} ${n}`, x + 12, y); x += 20 + doc.getTextWidth(`${k} ${n}`) + 14; });
    y += 28;
  }

  heading(`Open alerts (${s.alerts.length})`);
  if (!s.alerts.length) { font("normal", 10); ink(C.grey); txt("No alerts from the data entered.", mx, y); y += 20; }
  s.alerts.slice(0, 8).forEach((a) => {
    ensure(18); const col = a.severity === "Critical" ? C.red : a.severity === "High" ? C.amber : C.blue;
    fill(col); doc.circle(mx + 3, y - 3, 3, "F"); font("bold", 8.5); ink(col); txt(String(a.severity).toUpperCase(), mx + 12, y);
    font("normal", 9.5); ink("#1A2030"); txt(doc.splitTextToSize(pdfSafe(a.title), cw - 80)[0], mx + 70, y); y += 15;
  });
  y += 10;

  if (c.BAC !== null && c.BAC !== undefined) {
    heading("Cost summary");
    const items = [["Budget (BAC)", money(c.BAC)], ["Spent so far", money(c.AC)], ["Earned value", money(c.EV)], ["CPI", val(c.CPI)], ["SPI", val(c.SPI)], ["Forecast final cost", money(c.EAC)]];
    items.forEach((it, i) => { const x = mx + (i % 2) * (cw / 2); if (i % 2 === 0) ensure(18); font("normal", 9.5); ink(C.grey); txt(it[0], x, y); font("bold", 10); ink("#141A26"); txt(it[1], x + 120, y); if (i % 2 === 1) y += 18; });
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); font("normal", 8); ink(C.grey); txt(`${project.name}  |  InfraTrack report  |  Page ${i} of ${n}`, W / 2, 826, { align: "center" }); }
  return doc;
}
function buildReportWorkbook(project, s) {
  const wb = XLSX.utils.book_new(), c = s.cost || {}, nz = (v) => (v === null || v === undefined ? "" : v);
  const add = (name, rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]); if (widths) ws["!cols"] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add("Summary", [
    { Metric: "Project", Value: project.name }, { Metric: "Report date", Value: todayISO() },
    { Metric: "Planned start", Value: s.plan ? s.plan.startDate : "" }, { Metric: "Planned completion", Value: s.plan ? s.plan.endDate : "" }, { Metric: "Forecast completion", Value: s.forecastEnd || "" },
    { Metric: "Schedule status", Value: s.status || "" }, { Metric: "Days behind", Value: s.delayDays || 0 },
    { Metric: "Actual progress %", Value: nz(s.progress.actual) }, { Metric: "Planned progress %", Value: nz(s.progress.planned) },
    { Metric: "Health score", Value: nz(s.health.score) }, { Metric: "Health level", Value: s.health.level || "" },
    { Metric: "Budget (Rs)", Value: nz(c.BAC) }, { Metric: "Spent (Rs)", Value: nz(c.AC) }, { Metric: "Earned value (Rs)", Value: nz(c.EV) },
    { Metric: "CPI", Value: nz(c.CPI) }, { Metric: "SPI", Value: nz(c.SPI) }, { Metric: "Forecast final cost (Rs)", Value: nz(c.EAC) }, { Metric: "Open alerts", Value: s.alerts.length },
  ], [28, 26]);
  const bar = (v) => "█".repeat(Math.round(Math.max(0, Math.min(100, v)) / 5));
  add("Activities", (s.act ? s.act.rows : []).map((r) => ({ Activity: r.name, Start: r.start, Finish: r.end, "Planned % by today": r.plannedPct, "Actual %": r.actualPct, "Planned bar": bar(r.plannedPct), "Actual bar": bar(r.actualPct), Status: r.status, "Days late": r.delayDays || 0, "Forecast finish": r.forecastEnd || "" })), [30, 12, 12, 18, 10, 22, 22, 12, 10, 14]);
  add("Progress curve", (s.tr ? s.tr.chartProgress : []).map((q) => ({ Date: q.date, Day: q.x, "Planned %": q.planned, "Actual %": nz(q.actual) })), [12, 8, 12, 12]);
  add("Daily reports", (s.tr ? s.tr.rows : []).map((r) => ({ Date: r.date, Workers: nz(r.workers), "Planned workers": nz(r.plannedWorkers), Machines: nz(r.machines), "Planned machines": nz(r.plannedMachines), "Progress %": nz(r.progress) })), [12, 10, 16, 10, 16, 12]);
  add("Alerts", s.alerts.map((a) => ({ Severity: a.severity, Alert: a.title })), [12, 70]);
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const reportSlug = (p) => String(p.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "project";
async function runReportPdf(project, s, pushToast, setBusy) {
  setBusy(true);
  try { const doc = await buildReportPdf(project, s); downloadBlob(doc.output("blob"), `${reportSlug(project)}-report-${todayISO()}.pdf`); pushToast && pushToast("Report ready. If it opened in a new tab, use the browser's save button."); }
  catch (e) { pushToast && pushToast(e && e.message ? e.message : "Could not create the report."); }
  finally { setBusy(false); }
}
function buildReportText(project, s) {
  const c = s.cost || {}, crit = s.alerts.filter((a) => a.severity === "Critical").length;
  const L = [`*InfraTrack report: ${project.name}*`, `Date: ${fmtDMY(todayISO())}`, ""];
  L.push(`Progress: ${s.progress.actual === null ? "no data yet" : `${s.progress.actual}% actual vs ${s.progress.planned}% planned`}`);
  L.push(`Schedule: ${s.status || "-"}${s.delayDays > 0 ? ` (${s.delayDays} days behind)` : s.aheadDays > 0 ? ` (${s.aheadDays} days ahead)` : ""}`);
  if (s.forecastEnd) L.push(`Forecast finish: ${fmtDMY(s.forecastEnd)}`);
  if (c.usedPct !== null && c.usedPct !== undefined) L.push(`Budget used: ${c.usedPct}%${c.CPI !== null && c.CPI !== undefined ? ` (CPI ${c.CPI})` : ""}`);
  L.push(`Open alerts: ${s.alerts.length}${crit ? ` (${crit} critical)` : ""}`);
  if (s.alerts.length) { L.push("", "Top issues:"); s.alerts.slice(0, 3).forEach((a) => L.push(`- ${a.title}`)); }
  return L.join("\n");
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) { try { const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e2) { return false; } }
}
function shareWhatsApp(project, s) { window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText(project, s))}`, "_blank", "noopener"); }
function shareEmail(project, s) { window.location.href = `mailto:?subject=${encodeURIComponent(`Project report: ${project.name} (${fmtDMY(todayISO())})`)}&body=${encodeURIComponent(buildReportText(project, s).replace(/\*/g, ""))}`; }
async function shareReportPdf(project, s, pushToast, setBusy) {
  setBusy(true);
  try {
    const doc = await buildReportPdf(project, s), name = `${reportSlug(project)}-report-${todayISO()}.pdf`;
    const file = new File([doc.output("blob")], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Project report: ${project.name}`, text: buildReportText(project, s) }); }
      catch (e) { if (!e || e.name !== "AbortError") throw e; }
    } else {
      downloadBlob(file, name); shareWhatsApp(project, s);
      pushToast && pushToast("PDF downloaded. WhatsApp opened with the summary; attach the PDF there.");
    }
  } catch (e) { pushToast && pushToast(e && e.message ? e.message : "Could not share the report."); }
  finally { setBusy(false); }
}
function ReportPage({ theme, project, summary: s, pushToast }) {
  const [busy, setBusy] = useState(false);
  const xlsx = () => { try { downloadBlob(buildReportWorkbook(project, s), `${reportSlug(project)}-report-${todayISO()}.xlsx`); pushToast && pushToast("Excel report ready. Use the browser's save option if it opened in a tab."); } catch (e) { pushToast && pushToast("Could not create the Excel report."); } };
  return (
    <div>
      <SectionTitle theme={theme} title="Project Report" sub={`${project.name} · one click, built from the data entered so far`} />
      {!s.hasAnyData && <div style={{ marginBottom: 12 }}><EmptyState theme={theme} icon={FileText} title="Nothing to report yet" text="Add the plan and a few daily reports first. The report fills itself from them." /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card theme={theme}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: theme.text }}>PDF report (with graphs)</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, margin: "8px 0 14px" }}>Headline numbers, planned vs actual progress curve, activity progress bars, status mix, open alerts and cost summary. Ready to send to the client.</div>
          <Button theme={theme} icon={Download} onClick={() => !busy && runReportPdf(project, s, pushToast, setBusy)}>{busy ? "Preparing…" : "Download PDF"}</Button>
        </Card>
        <Card theme={theme}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: theme.text }}>Excel report</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, margin: "8px 0 14px" }}>Summary, activities (with in-cell bars), progress curve data, daily reports and alerts on separate sheets. It has no chart objects; the PDF carries the graphs.</div>
          <Button theme={theme} kind="subtle" icon={Download} onClick={xlsx}>Download Excel</Button>
        </Card>
        <Card theme={theme} style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: theme.text }}>Share with the client or your team</div>
          <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, margin: "8px 0 14px" }}>On a phone, “Share PDF” opens the share sheet, so you can pick WhatsApp, Gmail or any app and the PDF goes along. On a computer it downloads the PDF and opens WhatsApp with a short summary ready to send.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button theme={theme} icon={Download} onClick={() => !busy && shareReportPdf(project, s, pushToast, setBusy)}>{busy ? "Preparing…" : "Share PDF"}</Button>
            <Button theme={theme} kind="subtle" onClick={() => shareWhatsApp(project, s)}>WhatsApp message</Button>
            <Button theme={theme} kind="subtle" onClick={() => shareEmail(project, s)}>Email</Button>
            <Button theme={theme} kind="subtle" onClick={async () => pushToast && pushToast((await copyText(buildReportText(project, s))) ? "Summary copied." : "Could not copy the summary.")}>Copy summary</Button>
          </div>
        </Card>
      </div>
    </div>);
}

function Dashboard({ theme, project, projects, tracker, summary: s, setView, userName, onEditPlan, onSelectProject, backupInfo, pushToast }) {
  const today = todayISO();
  const [repBusy, setRepBusy] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const all = useMemo(() => projects.map(p => ({ p, s: summarizeProject(tracker[p.id], today) })), [projects, tracker, today]);
  const tr = s.tr, c = s.cost, h = s.health;
  const ticker = [];
  if (s.progress.actual !== null) ticker.push(`Progress ${s.progress.actual}% actual vs ${s.progress.planned}% planned`);
  if (s.forecastEnd) ticker.push(`Forecast completion ${fmtDMY(s.forecastEnd)}`);
  if (s.alerts.length) ticker.push(`${s.alerts.length} open alert${s.alerts.length === 1 ? "" : "s"}`);
  if (!ticker.length) ticker.push(`Enter plan and actual data for ${project.name} to see live analysis here`);
  const critical = s.alerts.filter(a => a.severity === "Critical").length;
  const statusColor = { Ahead: theme.green, "On Track": theme.blue, "At Risk": theme.warn, Delayed: theme.red }[s.status] || theme.text;
  const latest = tr && tr.latest ? tr.latest : null;
  const lastRow = tr && tr.rows.length ? tr.rows[tr.rows.length - 1] : null;
  const maxX = tr ? Math.max(tr.totalDays, ...tr.chartProgress.map(p => p.x)) : 0;
  const actCounts = s.act ? Object.entries(s.act.counts).map(([name, value]) => ({ name, value })) : [];
  const actColor = { Delayed: theme.red, "At Risk": theme.warn, "On Track": theme.blue, Ahead: theme.green, Completed: theme.green, "Not started": theme.textFaint };

  return (
    <div>
      <DashboardHero theme={theme} project={project} tickerItems={ticker} userName={userName} />
      <DelayBanner theme={theme} all={all} project={project} onSelectProject={onSelectProject} setView={setView} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Button theme={theme} small kind="subtle" icon={CalendarDays} onClick={() => setView("gantt")}>Timeline</Button>
        <Button theme={theme} small kind="subtle" onClick={() => !repBusy && shareReportPdf(project, s, pushToast, setRepBusy)}>Share report</Button>
        <Button theme={theme} small icon={Download} onClick={() => !repBusy && runReportPdf(project, s, pushToast, setRepBusy)}>{repBusy ? "Preparing report…" : "Download report (PDF)"}</Button>
      </div>
      {backupInfo && backupInfo.show && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: `1px solid ${theme.accent}`, borderRadius: 3, padding: "10px 14px", marginBottom: 12, background: theme.accentSoft }}>
          <Download size={16} color={theme.accent} />
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, flex: 1 }}>
            {backupInfo.never ? "You have entered data but never taken a backup." : `${backupInfo.since} changes since your last backup.`} The data lives only in this browser.
          </div>
          <Button theme={theme} small onClick={() => setView("backup")}>Back up now</Button>
        </div>
      )}
      {!s.hasAnyData && (
        <div style={{ marginBottom: 14 }}>
          <EmptyState theme={theme} icon={CalendarDays} title="No data entered for this project yet"
            text="Add the planned schedule, workers and machines, then report actuals daily. Activities, cost and safety can be added from their own pages. This dashboard fills in from exactly those entries."
            action={<Button theme={theme} icon={Plus} onClick={onEditPlan}>Add Planned Data</Button>} />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatTile theme={theme} label="Progress (actual vs plan)" trend={s.progress.variance === null || s.progress.variance === undefined ? undefined : { up: s.progress.variance >= 0, good: s.progress.variance >= 0 }} value={s.progress.actual === null ? "—" : `${s.progress.actual}%`}
          sub={s.progress.actual === null ? "Enter progress % in a daily report or log activity quantities" : `Planned ${s.progress.planned}% · ${signedNum(s.progress.variance)} pts · from ${s.progress.source}`} color={s.progress.variance !== null && s.progress.variance <= -2 ? theme.red : theme.text} />
        <StatTile theme={theme} label="Schedule status" value={s.status ? s.status : "—"}
          sub={s.delayDays > 0 ? `About ${s.delayDays} day${s.delayDays === 1 ? "" : "s"} behind plan` : s.aheadDays > 0 ? `About ${s.aheadDays} day${s.aheadDays === 1 ? "" : "s"} ahead of plan` : s.status ? "Right on the planned curve" : "Needs a progress % to judge"} color={statusColor} />
        <StatTile theme={theme} label="Forecast completion" value={s.forecastEnd ? fmtDMY(s.forecastEnd) : "—"}
          sub={s.plan ? `Planned ${fmtDMY(s.plan.endDate)}${s.projectedDelay !== null && s.projectedDelay !== undefined ? ` · ${s.projectedDelay > 0 ? `+${s.projectedDelay}d late` : s.projectedDelay < 0 ? `${-s.projectedDelay}d early` : "on time"}` : ""}` : "No plan yet"} color={s.projectedDelay > 0 ? theme.red : theme.text} />
        <StatTile theme={theme} label="Budget" value={c.usedPct === null ? fmtMoney(c.AC) : `${c.usedPct}% used`}
          sub={c.BAC === null ? "Spent so far (no budget in plan)" : `${fmtMoney(c.AC)} of ${fmtMoney(c.BAC)}${c.CPI !== null ? ` · CPI ${c.CPI}` : ""}`} color={c.CPI !== null && c.CPI < 0.9 ? theme.red : theme.text} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, marginBottom: 20 }}>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Project health" sub="Average of the signals that have data" />
          {h.score === null ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Not enough data yet. Health is calculated from schedule, resources, cost, safety and reporting entries.</div> : (
            <>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}><Gauge theme={theme} value={h.score} size={150} label={h.level} /></div>
              {h.parts.map(p => (
                <div key={p.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted }}><span>{p.label}</span><span style={{ fontFamily: FONT_MONO }}>{p.value}</span></div>
                  <ProgressBar theme={theme} value={p.value} color={p.value >= 80 ? theme.green : p.value >= 60 ? theme.accent : theme.red} />
                </div>))}
            </>)}
        </Card>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Progress curve" sub="Planned (dashed) vs the progress you reported" right={<Button theme={theme} small kind="ghost" onClick={() => setView("forecast")}>Forecast</Button>} />
          {!tr ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, padding: "40px 0", textAlign: "center" }}>Add planned data to draw the planned curve.</div> : (
            <div style={{ width: "100%", height: 250 }}>
              <LoopRC>
                <LineChart data={tr.chartProgress} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                  <XAxis dataKey="x" type="number" domain={[0, maxX]} tickFormatter={(v) => fmtShort(addDays(s.plan.startDate, v))} {...chartAxis(theme)} />
                  <YAxis domain={[0, 100]} unit="%" {...chartAxis(theme)} />
                  <Tooltip contentStyle={chartTip(theme)} labelFormatter={(v) => fmtDMY(addDays(s.plan.startDate, v))} formatter={(v, n) => [`${v}%`, n]} />
                  <Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="planned" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </LoopRC>
            </div>)}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Alerts" sub="Computed from planned vs actual — sorted by severity" right={<Button theme={theme} small kind="ghost" onClick={() => setView("delays")}>All delays</Button>} />
          {s.alerts.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>{s.hasAnyData ? "No alerts from the data entered so far." : "Nothing to check yet."}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.alerts.slice(0, 4).map(a => (
                <div key={a.key} className="bs-row" onClick={() => setView(a.view)} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "9px 11px" }}>
                  <StatusBadge theme={theme} status={a.severity} />
                  <div><div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 12.5, color: theme.text }}>{a.title}</div>
                    <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{a.detail}</div></div>
                </div>))}
            </div>)}
        </Card>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Activities" sub={s.act ? `${s.act.rows.length} tracked` : "None added yet"} right={<Button theme={theme} small kind="ghost" onClick={() => setView("activities")}>Open</Button>} />
          {!s.act ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Add activities like Earthwork or Paving to see which ones are on track.</div> : (
            <div>
              <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", background: theme.borderSoft, marginBottom: 14 }}>
                {actCounts.map(x => <div key={x.name} title={`${x.name}: ${x.value}`} style={{ width: `${(x.value / (actCounts.reduce((n, x) => n + x.value, 0) || 1)) * 100}%`, background: actColor[x.name] || theme.textFaint }} />)}
              </div>
              {actCounts.map(x => (<div key={x.name} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_UI, fontSize: 12.5, color: theme.text, padding: "4px 0" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: actColor[x.name] || theme.textFaint }} />{x.name}<span style={{ marginLeft: "auto", fontFamily: FONT_MONO }}>{x.value}</span></div>))}
            </div>)}
        </Card>
      </div>

      {all.length > 1 && (
        <Card theme={theme} style={{ marginBottom: 12 }}>
          <SectionTitle theme={theme} title="All projects" sub="Each row is computed from that project's own entries" />
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Project", "Progress", "Plan", "Status", "Forecast", "Budget used", "Alerts"].map(x => <th key={x} style={thStyle(theme)}>{x}</th>)}</tr></thead>
            <tbody>{all.map(({ p, s: ps }) => (
              <tr key={p.id} className="bs-row" onClick={() => onSelectProject(p.id)} style={{ borderBottom: `1px solid ${theme.borderSoft}`, background: p.id === project.id ? theme.panelAlt : "transparent" }}>
                <td style={{ ...tdStyle(theme), fontFamily: FONT_UI, fontWeight: 700 }}>{p.name}</td>
                <td style={tdStyle(theme)}>{ps.progress.actual === null ? "—" : `${ps.progress.actual}%`}</td>
                <td style={tdStyle(theme)}>{ps.progress.planned === null ? "—" : `${ps.progress.planned}%`}</td>
                <td style={tdStyle(theme)}>{ps.status ? <StatusBadge theme={theme} status={ps.status} /> : "—"}</td>
                <td style={tdStyle(theme)}>{ps.forecastEnd ? fmtDMY(ps.forecastEnd) : "—"}</td>
                <td style={tdStyle(theme)}>{ps.cost.usedPct === null ? "—" : `${ps.cost.usedPct}%`}</td>
                <td style={tdStyle(theme)}>{ps.alerts.length}</td></tr>))}</tbody></table></div>
        </Card>
      )}

      {s.plan && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <Button theme={theme} small kind="ghost" onClick={() => setShowDetail(v => !v)}>{showDetail ? "Hide detailed period comparison" : "Show detailed period comparison"}</Button>
          </div>
          {showDetail && <PeriodComparison theme={theme} summary={s} />}
        </div>
      )}
      <div style={{ marginBottom: 20 }}><LiveWeatherCard theme={theme} /></div>
    </div>
  );
}

/* =========================================================================
   PROJECT OVERVIEW
   ========================================================================= */
function ProjectOverview({ theme, project, summary: s, setView, onEditPlan, onEditProject }) {
  const today = todayISO();
  const plan = s.plan;
  const rowsInfo = [["Client", project.client], ["Main contractor", project.contractor], ["Project manager", project.pm], ["Contract value", project.value],
    ["Start", plan ? fmtDMY(plan.startDate) : project.start], ["Planned completion", plan ? fmtDMY(plan.endDate) : project.planned],
    ["Planned budget", plan && plan.budget > 0 ? fmtMoney(plan.budget) : "—"], ["Working days / week", plan ? plan.perWeek : "—"],
    ["Planned workers / machines per day", plan ? `${plan.workers} / ${plan.machines}` : "—"], ["Total working days planned", plan ? plan.totalWorkingDays : "—"]];
  const elapsed = plan ? clamp(round1((diffDays(plan.startDate, today) / Math.max(1, diffDays(plan.startDate, plan.endDate))) * 100), 0, 100) : null;
  const remaining = plan ? diffDays(today, plan.endDate) : null;
  const trk = s.trk;
  const checklist = [
    ["Planned schedule, workers and machines", !!plan, "planactual", plan ? "Done" : "Add"],
    ["Daily actual reports", trk.actuals.length > 0, "planactual", `${trk.actuals.length} entered`],
    ["Activities with planned quantities", trk.activities.length > 0, "activities", `${trk.activities.length} added`],
    ["Planned budget", !!(plan && plan.budget > 0), "cost", plan && plan.budget > 0 ? "Done" : "Add to plan"],
    ["Costs recorded", trk.costs.length > 0, "cost", `${trk.costs.length} entered`],
    ["Safety incidents logged (if any)", trk.incidents.length > 0, "safety", `${trk.incidents.length} logged`],
  ];
  return (
    <div>
      <PageHero theme={theme} icon={FolderKanban} title="Project Overview" subtitle={`${project.name} — details, plan and what data is still missing`}
        tickerItems={[plan ? `${fmtDMY(plan.startDate)} → ${fmtDMY(plan.endDate)}` : "No plan yet", elapsed !== null ? `${elapsed}% of planned time elapsed` : "", s.progress.actual !== null ? `${s.progress.actual}% progress reported` : ""].filter(Boolean)}
        right={<div style={{ display: "flex", gap: 8 }}><Button theme={theme} small kind="subtle" icon={Pencil} onClick={onEditProject}>Edit details</Button><Button theme={theme} small icon={CalendarDays} onClick={onEditPlan}>{plan ? "Edit plan" : "Add plan"}</Button></div>} />
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12, marginBottom: 12 }}>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Project details" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 18px" }}>
            {rowsInfo.map(([k, v]) => (<div key={k}><div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, fontWeight: 700 }}>{k}</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: theme.text, fontWeight: 600, marginTop: 2 }}>{v}</div></div>))}
          </div>
        </Card>
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Time vs progress" />
          {!plan ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Add planned dates to compare elapsed time with progress.</div> : (
            <>
              <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Planned time elapsed: {elapsed}%</div>
              <ProgressBar theme={theme} value={elapsed} color={theme.blue} />
              <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, margin: "12px 0 4px" }}>Progress reported: {s.progress.actual === null ? "—" : `${s.progress.actual}%`}</div>
              <ProgressBar theme={theme} value={s.progress.actual || 0} color={theme.accent} />
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.textMuted, marginTop: 12 }}>
                {remaining > 0 ? `${remaining} calendar days to planned completion` : remaining === 0 ? "Planned completion is today" : `${-remaining} days past planned completion`}
              </div>
            </>)}
        </Card>
      </div>
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Data checklist" sub="The more you enter, the more complete every page becomes" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checklist.map(([label, done, view, note]) => (
            <div key={label} className="bs-row" onClick={() => setView(view)} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "9px 12px" }}>
              {done ? <CircleCheck size={16} color={theme.green} /> : <CircleAlert size={16} color={theme.accent} />}
              <span style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, flex: 1 }}>{label}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: done ? theme.green : theme.accent }}>{note}</span>
              <ChevronRight size={14} color={theme.textFaint} />
            </div>))}
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   DELAY DETECTION — every signal that says "behind plan"
   ========================================================================= */
function DelayDetection({ theme, project, summary: s, setView }) {
  const tr = s.tr, act = s.act;
  const th = thStyle(theme), td = tdStyle(theme);
  const lateActs = act ? act.rows.filter(r => r.status === "Delayed" || r.status === "At Risk").sort((a, b) => b.delayDays - a.delayDays) : [];
  const varSeries = tr ? tr.rows.filter(r => r.progressVar !== null).map(r => ({ label: fmtShort(r.date), variance: r.progressVar })) : [];
  const reasons = Object.entries(s.safety.lostByReason).map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours);
  const reasonDays = tr ? tr.reasons : [];
  const statusColor = { Ahead: theme.green, "On Track": theme.blue, "At Risk": theme.warn, Delayed: theme.red }[s.status] || theme.text;
  if (!s.hasAnyData) {
    return (<div><PageHero theme={theme} icon={AlertTriangle} title="Delay Detection" subtitle={project.name} />
      <EmptyState theme={theme} icon={AlertTriangle} title="Nothing to analyse yet" text="Delay detection compares your planned data with the actuals you report. Add the plan and a first daily report to start."
        action={<Button theme={theme} icon={ArrowRight} onClick={() => setView("planactual")}>Go to Plan vs Actual</Button>} /></div>);
  }
  return (
    <div>
      <PageHero theme={theme} icon={AlertTriangle} title="Delay Detection" subtitle={`${project.name} — schedule, activities, resources, cost and safety signals in one place`}
        tickerItems={[`${s.alerts.length} alert${s.alerts.length === 1 ? "" : "s"}`, s.delayDays > 0 ? `${s.delayDays} days behind plan` : s.aheadDays > 0 ? `${s.aheadDays} days ahead` : "", s.projectedDelay > 0 ? `Forecast +${s.projectedDelay} days late` : ""].filter(Boolean)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Schedule status" value={s.status || "—"} sub={s.progress.actual !== null ? `${s.progress.actual}% actual vs ${s.progress.planned}% planned` : "Needs progress %"} color={statusColor} />
        <StatTile theme={theme} label="Days behind" value={s.delayDays === null ? "—" : s.delayDays > 0 ? s.delayDays : s.aheadDays > 0 ? `+${s.aheadDays}` : 0} sub={s.aheadDays > 0 ? "Days ahead of plan" : "Where the plan expected this progress"} color={s.delayDays > 0 ? theme.red : s.aheadDays > 0 ? theme.green : theme.text} />
        <StatTile theme={theme} label="Delayed activities" value={act ? (act.counts["Delayed"] || 0) : "—"} sub={act ? `${act.counts["At Risk"] || 0} more at risk` : "No activities added"} color={act && act.counts["Delayed"] ? theme.red : theme.text} />
        <StatTile theme={theme} label="Hours lost" value={s.safety.lostTotal} sub="From daily reports (weather, shortages…)" color={s.safety.lostTotal ? theme.accent : theme.text} />
      </div>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="All alerts" sub="Click an alert to open the page where it comes from" />
        {s.alerts.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>No delay signal in the data entered so far.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {s.alerts.map(a => (
              <div key={a.key} className="bs-row" onClick={() => setView(a.view)} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: "10px 12px", background: theme.panelAlt }}>
                <StatusBadge theme={theme} status={a.severity} />
                <div style={{ flex: 1 }}><div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, color: theme.text }}>{a.title} <span style={{ fontWeight: 600, color: theme.textFaint }}>· {a.category}</span></div>
                  <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{a.detail}</div></div>
                <ChevronRight size={14} color={theme.textFaint} />
              </div>))}
          </div>)}
      </Card>
      {varSeries.length > 0 && (
        <Card theme={theme} style={{ marginBottom: 12 }}>
          <SectionTitle theme={theme} title="Progress variance per report" sub="Actual minus planned cumulative progress, in percentage points. Below zero = behind plan." />
          <div style={{ width: "100%", height: 210 }}><LoopRC>
            <LineChart data={varSeries} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
              <XAxis dataKey="label" {...chartAxis(theme)} /><YAxis {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} />
              <Line isAnimationActive={false} type="monotone" dataKey="variance" name="Variance (pts)" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></LoopRC></div>
        </Card>)}
      {lateActs.length > 0 && (
        <Card theme={theme} style={{ marginBottom: 12 }}>
          <SectionTitle theme={theme} title="Delayed and at-risk activities" right={<Button theme={theme} small kind="ghost" onClick={() => setView("activities")}>Open activities</Button>} />
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Activity", "Contractor", "Plan %", "Actual %", "Behind", "Forecast finish", "Planned finish", "Status"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
            <tbody>{lateActs.map(r => (<tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
              <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}</td><td style={{ ...td, fontFamily: FONT_UI }}>{r.contractor || "—"}</td>
              <td style={td}>{r.plannedPct}%</td><td style={{ ...td, fontWeight: 700 }}>{r.actualPct}%</td><td style={td}>{r.delayDays ? `${r.delayDays}d` : "—"}</td>
              <td style={td}>{r.forecastEnd ? fmtDMY(r.forecastEnd) : "—"}</td><td style={td}>{fmtDMY(r.end)}</td><td style={td}><StatusBadge theme={theme} status={r.status} /></td></tr>))}</tbody></table></div>
        </Card>)}
      {(reasons.length > 0 || reasonDays.length > 0) && (
        <Card theme={theme}>
          <SectionTitle theme={theme} title="Why work is slipping" sub="From the delay reasons logged in daily reports" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><div style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 6 }}>Behind-plan days by reason</div>
              {reasonDays.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textFaint }}>No reasons logged on behind-plan days.</div> : reasonDays.map(r => (
                <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_UI, fontSize: 12.5, color: theme.text, padding: "3px 0" }}><span>{r.reason}</span><span style={{ fontFamily: FONT_MONO }}>{r.count}</span></div>))}</div>
            <div><div style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 6 }}>Hours lost by reason</div>
              {reasons.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textFaint }}>No lost hours tagged with a reason.</div> : reasons.map(r => (
                <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_UI, fontSize: 12.5, color: theme.text, padding: "3px 0" }}><span>{r.name}</span><span style={{ fontFamily: FONT_MONO }}>{r.hours} h</span></div>))}</div>
          </div>
        </Card>)}
    </div>
  );
}

/* =========================================================================
   CONTRACTOR PERFORMANCE — from activities, costs and incidents entered
   ========================================================================= */
function ContractorPerformance({ theme, project, summary: s, setView }) {
  const rows = s.contractors;
  const th = thStyle(theme), td = tdStyle(theme);
  const hero = <PageHero theme={theme} icon={Users} title="Contractor Performance" subtitle={`${project.name} — based on the activities, costs and incidents tagged to each contractor`}
    tickerItems={rows.length ? [`${rows.length} contractor${rows.length === 1 ? "" : "s"}`, rows[0] && rows[0].spi !== null ? `Lowest SPI: ${rows[0].name} (${rows[0].spi})` : ""].filter(Boolean) : []} />;
  if (!rows.length) return (<div>{hero}<EmptyState theme={theme} icon={Users} title="No contractor data yet" text="Put a contractor name on each activity (and optionally on costs and incidents). This page then ranks them by schedule performance, delays, spend and safety."
    action={<Button theme={theme} icon={ArrowRight} onClick={() => setView("activities")}>Go to Activities</Button>} /></div>);
  const chart = rows.filter(r => r.plannedAvg !== null).map(r => ({ name: r.name.length > 16 ? r.name.slice(0, 15) + "…" : r.name, Planned: r.plannedAvg, Actual: r.actualAvg }));
  return (
    <div>
      {hero}
      {chart.length > 0 && (<Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Average activity progress" sub="Planned % vs actual % across each contractor's activities, today" />
        <div style={{ width: "100%", height: 240 }}><LoopRC><BarChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
          <XAxis dataKey="name" {...chartAxis(theme)} /><YAxis domain={[0, 100]} unit="%" {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} /><Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="Planned" fill={theme.blue} radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="Actual" fill={theme.accent} radius={[4, 4, 0, 0]} /></BarChart></LoopRC></div>
      </Card>)}
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Scorecard" sub="Sorted by schedule performance (SPI = actual ÷ planned progress, lowest first)" />
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Contractor", "Activities", "Plan %", "Actual %", "Δ pts", "SPI", "Delayed", "At risk", "Worst delay", "Spent", "Budget", "Incidents"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
          <tbody>{rows.map(r => (<tr key={r.name} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
            <td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}</td><td style={td}>{r.activities}</td>
            <td style={td}>{r.plannedAvg === null ? "—" : `${r.plannedAvg}%`}</td><td style={{ ...td, fontWeight: 700 }}>{r.actualAvg === null ? "—" : `${r.actualAvg}%`}</td>
            <td style={{ ...td, color: r.variance < 0 ? theme.red : r.variance > 0 ? theme.green : theme.textMuted }}>{signedNum(r.variance)}</td>
            <td style={{ ...td, fontWeight: 700, color: r.spi === null ? theme.textMuted : r.spi < 0.9 ? theme.red : r.spi < 1 ? theme.accent : theme.green }}>{r.spi === null ? "—" : r.spi}</td>
            <td style={td}>{r.delayed}</td><td style={td}>{r.atRisk}</td><td style={td}>{r.worstDelay ? `${r.worstDelay}d` : "—"}</td>
            <td style={td}>{r.spent ? fmtMoney(r.spent) : "—"}</td><td style={td}>{r.budget ? fmtMoney(r.budget) : "—"}</td><td style={{ ...td, color: r.incidents ? theme.accent : theme.textMuted }}>{r.incidents}</td></tr>))}</tbody></table></div>
      </Card>
    </div>
  );
}

/* =========================================================================
   RESOURCE ANALYTICS — workers and machines, planned vs actual
   ========================================================================= */
function ResourceAnalytics({ theme, project, summary: s, setView }) {
  const tr = s.tr;
  const th = thStyle(theme), td = tdStyle(theme);
  const hero = <PageHero theme={theme} icon={Boxes} title="Resource Analytics" subtitle={`${project.name} — workers and machines, planned vs actual`} />;
  if (!tr || tr.rows.length === 0) return (<div>{hero}<EmptyState theme={theme} icon={Boxes} title="No resource data yet" text="Resource analytics is built from the workers and machines you report each day against the plan."
    action={<Button theme={theme} icon={ArrowRight} onClick={() => setView("planactual")}>{tr ? "Enter a daily report" : "Add planned data"}</Button>} /></div>);
  const R = tr.resources;
  const n = R.compDays;
  const avg = (v) => (n ? round1(v / n) : null);
  const worst = [...tr.rows].filter(r => r.working && r.workerVar < 0).sort((a, b) => a.workerVar - b.workerVar).slice(0, 6);
  const monthly = tr.monthly.filter(m => m.reportedDays > 0).map(m => ({ label: monthLabel(m.key), "Planned man-days": m.manDaysPlannedReported, "Actual man-days": m.manDaysActual }));
  const util = R.pMan > 0 ? round1((R.aMan / R.pMan) * 100) : null;
  return (
    <div>
      {hero}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Avg workers / day" value={n ? `${avg(R.aMan)} vs ${avg(R.pMan)}` : "—"} sub={`Actual vs planned over ${n} reported working day${n === 1 ? "" : "s"}`} color={R.workerShort >= 10 ? theme.red : theme.text} />
        <StatTile theme={theme} label="Avg machines / day" value={n ? `${avg(R.aMac)} vs ${avg(R.pMac)}` : "—"} sub="Actual vs planned" color={R.machineShort >= 10 ? theme.red : theme.text} />
        <StatTile theme={theme} label="Workforce utilisation" value={util === null ? "—" : `${util}%`} sub="Actual man-days ÷ planned man-days on reported days" color={util !== null && util < 90 ? theme.accent : theme.text} />
        <StatTile theme={theme} label="Total man-days reported" value={s.safety.manDays.toLocaleString()} sub={`${tr.rows.length} daily report${tr.rows.length === 1 ? "" : "s"}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[["Workers per day", "plannedWorkers", "actualWorkers"], ["Machines per day", "plannedMachines", "actualMachines"]].map(([title, pk, ak]) => (
          <Card theme={theme} key={title}>
            <SectionTitle theme={theme} title={title} sub={`Last ${Math.min(45, tr.rows.length)} reported days`} />
            <div style={{ width: "100%", height: 220 }}><LoopRC>
              <LineChart data={tr.chartResources} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
                <XAxis dataKey="label" {...chartAxis(theme)} /><YAxis allowDecimals={false} {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} /><Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
                <Line isAnimationActive={false} type="stepAfter" dataKey={pk} name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey={ak} name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></LoopRC></div>
          </Card>))}
      </div>
      {monthly.length > 0 && (<Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Man-days by month" sub="Planned man-days are counted only for the days actually reported" />
        <div style={{ width: "100%", height: 220 }}><LoopRC><BarChart data={monthly} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...chartAxis(theme)} /><YAxis {...chartAxis(theme)} /><Tooltip contentStyle={chartTip(theme)} /><Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="Planned man-days" fill={theme.blue} radius={[4, 4, 0, 0]} /><Bar isAnimationActive={false} dataKey="Actual man-days" fill={theme.accent} radius={[4, 4, 0, 0]} /></BarChart></LoopRC></div>
      </Card>)}
      {worst.length > 0 && (<Card theme={theme}>
        <SectionTitle theme={theme} title="Biggest workforce shortfalls" sub="Days where fewer workers than planned were on site" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Date", "Planned", "Actual", "Short by", "Reason"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
          <tbody>{worst.map(r => (<tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}><td style={td}>{fmtDMY(r.date)}</td><td style={td}>{r.plannedWorkers}</td><td style={td}>{r.workers}</td>
            <td style={{ ...td, color: theme.red, fontWeight: 700 }}>{-r.workerVar}</td><td style={{ ...td, fontFamily: FONT_UI }}>{r.reason || "—"}</td></tr>))}</tbody></table>
      </Card>)}
    </div>
  );
}

/* =========================================================================
   PREDICTIVE COMPLETION — from the pace achieved so far
   ========================================================================= */
function Forecast({ theme, project, summary: s, setView }) {
  const tr = s.tr, plan = s.plan, act = s.act;
  const th = thStyle(theme), td = tdStyle(theme);
  const hero = <PageHero theme={theme} icon={TrendingUp} title="Predictive Completion" subtitle={`${project.name} — when it will finish if the current pace continues`} />;
  if (!tr || !tr.latest || !tr.forecastEnd) return (<div>{hero}<EmptyState theme={theme} icon={TrendingUp} title="Not enough data to forecast" text={plan ? "A forecast needs at least one daily report with a progress % above 0. The forecast uses the average pace achieved so far." : "Add planned data first, then report actual progress."}
    action={<Button theme={theme} icon={ArrowRight} onClick={() => setView("planactual")}>{plan ? "Enter a daily report" : "Add planned data"}</Button>} /></div>);
  const latest = tr.latest;
  const remainingWd = latest.date < plan.endDate ? countWorkingDays(addDays(latest.date, 1), plan.endDate, plan.perWeek) : 0;
  const reqRate = remainingWd > 0 ? (100 - latest.progress) / remainingWd : null;
  const mult = reqRate !== null && tr.rate ? round2(reqRate / tr.rate) : null;
  const avgW = tr.resources.compDays ? tr.resources.aMan / tr.resources.compDays : null;
  const xOf = (d) => diffDays(plan.startDate, d);
  const data = tr.chartProgress.map(p => ({ ...p, projected: null }));
  const put = (d, v) => { const x = xOf(d); const ex = data.find(p => p.x === x); if (ex) ex.projected = v; else data.push({ x, date: d, planned: Math.round((d >= plan.endDate ? 100 : tr.plannedFor(d).cum) * 10) / 10, actual: null, projected: v }); };
  put(latest.date, latest.progress); put(tr.forecastEnd, 100);
  data.sort((a, b) => a.x - b.x);
  const maxX = Math.max(...data.map(p => p.x));
  const late = tr.projectedDelay;
  return (
    <div>
      {hero}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Forecast completion" value={fmtDMY(tr.forecastEnd)} sub={`Planned ${fmtDMY(plan.endDate)}`} color={late > 0 ? theme.red : theme.green} />
        <StatTile theme={theme} label={late > 0 ? "Expected slip" : "Expected margin"} value={late === 0 ? "On time" : `${Math.abs(late)} days`} sub={late > 0 ? "Later than planned completion" : "Earlier than planned completion"} color={late > 0 ? theme.red : theme.green} />
        <StatTile theme={theme} label="Current pace" value={`${round2(tr.rate)}% / working day`} sub={`Based on ${tr.rows.filter(r => r.progress !== null).length} progress report(s)${tr.lowConfidence ? " — early estimate" : ""}`} />
        <StatTile theme={theme} label="Forecast final cost" value={fmtMoney(s.cost.EAC)} sub={s.cost.EAC !== null ? `Budget ${fmtMoney(s.cost.BAC)} · CPI ${s.cost.CPI}` : "Needs budget, spend and progress"} color={s.cost.EAC !== null && s.cost.EAC > s.cost.BAC ? theme.red : theme.text} />
      </div>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Plan, actual and projection" sub="The dotted line continues at the average pace achieved so far" />
        <div style={{ width: "100%", height: 280 }}><LoopRC>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}><CartesianGrid stroke={theme.borderSoft} strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" domain={[0, maxX]} tickFormatter={(v) => fmtShort(addDays(plan.startDate, v))} {...chartAxis(theme)} /><YAxis domain={[0, 100]} unit="%" {...chartAxis(theme)} />
            <Tooltip contentStyle={chartTip(theme)} labelFormatter={(v) => fmtDMY(addDays(plan.startDate, v))} formatter={(v, n) => [`${v}%`, n]} /><Legend wrapperStyle={{ fontFamily: FONT_UI, fontSize: 12 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="planned" name="Planned" stroke={theme.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            <Line isAnimationActive={false} type="linear" dataKey="projected" name="Projected" stroke={theme.red} strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls /></LineChart></LoopRC></div>
      </Card>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="What it takes to finish on the planned date" />
        {late <= 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text }}>At the current pace the project finishes on or before the planned date. Keep the pace steady.</div>
          : remainingWd === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text }}>The planned completion date has passed with {round1(100 - latest.progress)}% still to do.</div>
          : (<div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, lineHeight: 1.6 }}>
            Remaining {round1(100 - latest.progress)}% over {remainingWd} working day{remainingWd === 1 ? "" : "s"} needs about <b>{round2(reqRate)}%</b> per working day, against <b>{round2(tr.rate)}%</b> achieved so far — roughly <b>{mult}×</b> the current pace.
            {avgW !== null && mult > 1 && <> If output scales with workers, that is about <b>{Math.ceil(avgW * mult)}</b> workers per day instead of the current average of <b>{round1(avgW)}</b>. This is a rough estimate — machines, space and sequencing also limit how much extra labour helps.</>}
          </div>)}
      </Card>
      {act && act.rows.some(r => r.forecastEnd) && (<Card theme={theme}>
        <SectionTitle theme={theme} title="Activity forecasts" sub="Pace per activity since its planned start" />
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ borderBottom: `1px solid ${theme.border}` }}>{["Activity", "Actual %", "Planned finish", "Forecast finish", "Slip", "Status"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
          <tbody>{act.rows.filter(r => r.forecastEnd).map(r => (<tr key={r.id} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}><td style={{ ...td, fontFamily: FONT_UI, fontWeight: 700 }}>{r.name}</td><td style={td}>{r.actualPct}%</td><td style={td}>{fmtDMY(r.end)}</td><td style={td}>{fmtDMY(r.forecastEnd)}</td>
            <td style={{ ...td, color: r.projectedDelay > 0 ? theme.red : theme.green }}>{r.projectedDelay > 0 ? `+${r.projectedDelay}d` : r.projectedDelay < 0 ? `${r.projectedDelay}d` : "on time"}</td><td style={td}><StatusBadge theme={theme} status={r.status} /></td></tr>))}</tbody></table></div>
      </Card>)}
    </div>
  );
}

/* =========================================================================
   DAILY PROGRESS REPORT — built from the entries of the chosen date
   ========================================================================= */
function buildDpr(project, s, date) {
  const trk = s.trk, tr = s.tr;
  const row = tr ? tr.rows.find(r => r.date === date) : null;
  const sections = [];
  const prog = [];
  if (row) {
    prog.push(row.progress !== null && row.progress !== undefined ? `Cumulative progress reported: ${row.progress}% (planned ${row.plannedProgress}%, ${signedNum(row.progressVar)} pts${row.status ? ` — ${row.status}` : ""})` : "No cumulative progress % reported for this day.");
  }
  const logs = trk.actLogs.filter(l => l.date === date);
  logs.forEach(l => { const a = trk.activities.find(x => x.id === l.activityId); if (a) prog.push(`${a.name}: +${l.qty} ${a.unit}${l.note ? ` (${l.note})` : ""}`); });
  if (prog.length) sections.push({ title: "WORK PROGRESS", lines: prog });
  if (row) {
    sections.push({ title: "WORKFORCE AND EQUIPMENT", lines: [`Workers on site: ${row.workers} (planned ${row.plannedWorkers}${row.working ? `, ${signedNum(row.workerVar)}` : ", not a planned working day"})`, `Machines working: ${row.machines} (planned ${row.plannedMachines}${row.working ? `, ${signedNum(row.machineVar)}` : ""})`] });
    if (row.photo) sections[sections.length - 1].lines.push(`Counts include an estimate from ${row.photo.photos} site photo(s) via ${row.photo.engine || "AI"}: ${row.photo.workers} workers, ${row.photo.machines} machines (${row.photo.confidence} confidence)`);
    const wl = [];
    if (row.weather) wl.push(`Weather: ${row.weather}`);
    if (row.hoursLost > 0) wl.push(`Working hours lost: ${row.hoursLost}`);
    if (row.reason) wl.push(`Delay reason: ${row.reason}`);
    if (row.remarks) wl.push(`Remarks: ${row.remarks}`);
    if (wl.length) sections.push({ title: "WEATHER AND DELAYS", lines: wl });
  }
  const costs = trk.costs.filter(c => c.date === date);
  if (costs.length) sections.push({ title: "COSTS BOOKED", lines: [...costs.map(c => `${c.category}: Rs. ${Math.round(c.amount).toLocaleString("en-IN")}${c.note ? ` (${c.note})` : ""}`), `Total: Rs. ${Math.round(costs.reduce((a, c) => a + c.amount, 0)).toLocaleString("en-IN")}`] });
  const inc = trk.incidents.filter(i => i.date === date);
  if (inc.length) sections.push({ title: "SAFETY", lines: inc.map(i => `${i.severity} ${i.type}${i.contractor ? ` (${i.contractor})` : ""}: ${i.description} [${i.status}]`) });
  return sections;
}
function DPRPage({ theme, project, summary: s, pushToast }) {
  const today = todayISO();
  const tr = s.tr;
  const lastDate = tr && tr.rows.length ? tr.rows[tr.rows.length - 1].date : today;
  const [date, setDate] = useState(lastDate);
  const [busy, setBusy] = useState(false);
  const inputStyle = trkInput(theme);
  const sections = useMemo(() => buildDpr(project, s, date), [project, s, date]);
  const [mailing, setMailing] = useState(false);
  // E-mails this report to the signed-in user's own login address (the server decides the recipient).
  const emailIt = async () => {
    if (mailing) return;
    setMailing(true);
    try {
      const res = await fetch("/api/email/dpr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectName: project.name, date, sections }) });
      if (res.ok) pushToast("Report emailed to your login address.");
      else {
        const j = await res.json().catch(() => ({}));
        pushToast(j.code === "not_configured" ? "Email is not set up yet. Add RESEND_API_KEY in Vercel (see docs/EMAIL.md)." : res.status === 401 || res.redirected ? "Sign in again to send email." : "Could not send the email. Try again in a minute.");
      }
    } catch (err) { pushToast("No connection. Could not send the email."); }
    finally { setMailing(false); }
  };
  const textOut = () => [`DAILY PROGRESS REPORT`, project.name, `Date: ${fmtDMY(date)}`, "", ...sections.flatMap(sec => [sec.title, ...sec.lines.map(l => `  - ${l}`), ""])].join("\n");
  const exportTxt = () => { downloadBlob(new Blob([textOut()], { type: "text/plain" }), `DPR_${date}.txt`); pushToast("Report opened in a new tab."); };
  const exportPdf = async () => {
    setBusy(true);
    try {
      const JsPDF = await loadJsPDF();
      const doc = new JsPDF({ unit: "pt", format: "a4" });
      const mx = 48, pw = doc.internal.pageSize.getWidth(), cw = pw - mx * 2;
      let y = 56;
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(20, 20, 20); doc.text("Daily Progress Report", mx, y); y += 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(90, 90, 90);
      doc.text(project.name, mx, y); y += 14; doc.text(`Report date: ${fmtDMY(date)}`, mx, y); y += 18;
      doc.setDrawColor(220, 220, 220); doc.line(mx, y, pw - mx, y); y += 22;
      sections.forEach(sec => {
        if (y > 740) { doc.addPage(); y = 56; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(150, 110, 20); doc.text(sec.title, mx, y); y += 16;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
        sec.lines.forEach(line => doc.splitTextToSize(`• ${line}`, cw).forEach(w => { if (y > 770) { doc.addPage(); y = 56; } doc.text(w, mx, y); y += 14; }));
        y += 10;
      });
      downloadBlob(doc.output("blob"), `DPR_${date}.pdf`);
      pushToast("PDF opened in a new tab — use your browser's save button if it doesn't download automatically.");
    } catch (err) { pushToast(err && err.message ? err.message : "Could not generate the PDF."); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <PageHero theme={theme} icon={FileText} title="Daily Progress Report" subtitle={`${project.name} — assembled from what was entered for the chosen date`}
        right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" max={today} style={{ ...inputStyle, width: 160 }} className="bs-input-focus" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
          <Button theme={theme} small kind="subtle" icon={Download} onClick={exportTxt}>Text</Button>
          <Button theme={theme} small icon={Download} onClick={exportPdf}>{busy ? "Preparing…" : "PDF"}</Button>
          <Button theme={theme} small kind="subtle" icon={Send} onClick={emailIt}>{mailing ? "Sending…" : "Email me"}</Button></div>} />
      <Card theme={theme}>
        <SectionTitle theme={theme} title={`Report for ${fmtDMY(date)}`} sub="Every line below comes from an entry you made for this date" />
        {sections.length === 0 ? <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted }}>Nothing was entered for this date. Add a daily report, activity progress, cost or incident for it and it appears here.</div> : sections.map(sec => (
          <div key={sec.title} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 800, color: theme.accent, letterSpacing: 0.4, marginBottom: 6 }}>{sec.title}</div>
            {sec.lines.map((l, i) => <div key={i} style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.text, padding: "2px 0" }}>• {l}</div>)}
          </div>))}
      </Card>
    </div>
  );
}

/* =========================================================================
   AUDIT TRAIL — every change made in the app
   ========================================================================= */
function AuditTrail({ theme, log }) {
  return (
    <div>
      <PageHero theme={theme} icon={Shield} title="Audit Trail" subtitle="Every plan, report, cost, activity and incident change — who made it and when" tickerItems={[`${log.length} change${log.length === 1 ? "" : "s"} recorded`]} />
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Change history" sub="Most recent first" />
        {log.length === 0 ? <div style={{ color: theme.textFaint, fontFamily: FONT_UI, fontSize: 13, padding: 20, textAlign: "center" }}>No changes recorded yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.slice(0, 200).map((e, i) => (
              <div key={i} style={{ border: `1px solid ${theme.borderSoft}`, borderRadius: 3, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: theme.text }}>{e.activity}</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.textFaint }}>{e.date}</span>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: theme.accent, margin: "4px 0" }}>{e.from} → {e.to}</div>
                <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textMuted }}>By {e.by} · {e.source}</div>
              </div>))}
          </div>)}
      </Card>
    </div>
  );
}

/* =========================================================================
   COPILOT — answers come straight from the computed summary
   ========================================================================= */
function Copilot({ theme, project, summary: s, open, setOpen }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const prompts = ["What is delayed?", "Cost status", "Forecast completion", "Safety summary", "Workers today", "What should I focus on?"];
  useEffect(() => { setMessages([{ role: "bot", text: project ? `Ask me about ${project.name}. I answer only from the plan and actuals entered in this app.` : "Add a project first, then ask me about it." }]); }, [project && project.id]);
  const answer = (q) => answerQuestion(q, s, project, { signedNum, fmtMoney, fmtDMY });
  const send = (text) => { const q = text || input; if (!q.trim()) return; setMessages(m => [...m, { role: "user", text: q }, { role: "bot", text: answer(q) }]); setInput(""); };
  if (!open) return null;
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, width: 380, maxHeight: 540, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, boxShadow: "0 20px 60px #00000050", zIndex: 80, display: "flex", flexDirection: "column", }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "13px 15px", borderBottom: `1px solid ${theme.borderSoft}` }}>
        <div style={{ width: 28, height: 28, borderRadius: 3, background: theme.accentSoft, display: "grid", placeItems: "center" }}><Bot size={15} color={theme.accent} /></div>
        <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13.5, color: theme.text, flex: 1 }}>InfraTrack Copilot</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 360 }}>
        {messages.map((m, i) => (<div key={i} style={{ whiteSpace: "pre-wrap", alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", background: m.role === "user" ? theme.accentSoft : theme.panelAlt, color: theme.text, padding: "9px 12px", borderRadius: 3, fontFamily: FONT_UI, fontSize: 12.5, lineHeight: 1.45 }}>{m.text}</div>))}
      </div>
      <div style={{ padding: 10, borderTop: `1px solid ${theme.borderSoft}` }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {prompts.map(p => (<button key={p} onClick={() => send(p)} style={{ fontFamily: FONT_UI, fontSize: 11, color: theme.textMuted, background: theme.panelAlt, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "5px 9px", cursor: "pointer" }}>{p}</button>))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask about this project…" style={{ flex: 1, background: theme.panelAlt, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "9px 11px", color: theme.text, fontFamily: FONT_UI, fontSize: 12.5, outline: "none" }} />
          <button onClick={() => send()} style={{ background: theme.accent, border: "none", borderRadius: 3, width: 36, display: "grid", placeItems: "center", cursor: "pointer" }}><Send size={14} color={theme.onAccent} /></button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   COMMAND PALETTE — pages + the current project's real activities / contractors
   ========================================================================= */
function CommandPalette({ theme, onClose, onNavigate, projects, summary }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return [];
    const pages = NAV.filter(n => n.label.toLowerCase().includes(s)).map(n => ({ kind: "Page", label: n.label, sub: "", go: n.id }));
    const acts = (summary && summary.act ? summary.act.rows : []).filter(a => a.name.toLowerCase().includes(s)).slice(0, 5).map(a => ({ kind: "Activity", label: a.name, sub: `${a.actualPct}% actual · ${a.status}`, go: "activities" }));
    const contr = (summary ? summary.contractors : []).filter(c => c.name.toLowerCase().includes(s)).slice(0, 4).map(c => ({ kind: "Contractor", label: c.name, sub: `${c.activities} activit${c.activities === 1 ? "y" : "ies"}`, go: "contractors" }));
    const projs = projects.filter(p => p.name.toLowerCase().includes(s)).slice(0, 3).map(p => ({ kind: "Project", label: p.name, sub: p.client, go: "overview" }));
    return [...pages, ...acts, ...contr, ...projs];
  }, [q, projects, summary]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000aa", zIndex: 100, display: "flex", justifyContent: "center", paddingTop: "12vh" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "90vw", height: "fit-content", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 3, boxShadow: "0 20px 60px #00000050", }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${theme.borderSoft}` }}>
          <Search size={16} color={theme.textFaint} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search pages, activities, contractors, projects…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: theme.text, fontFamily: FONT_UI, fontSize: 14 }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.textFaint, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "2px 6px" }}>ESC</span>
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: results.length ? 6 : 0 }}>
          {q.trim() && results.length === 0 && <div style={{ padding: 24, textAlign: "center", color: theme.textFaint, fontFamily: FONT_UI, fontSize: 13 }}>No matches found.</div>}
          {results.map((r, i) => (
            <button key={i} onClick={() => { onNavigate(r.go); onClose(); }} className="bs-row" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 3, border: "none", background: "transparent" }}>
              <div><div style={{ fontFamily: FONT_UI, fontSize: 13.5, color: theme.text, fontWeight: 600 }}>{r.label}</div>{r.sub && <div style={{ fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint }}>{r.sub}</div>}</div>
              <span style={{ fontFamily: FONT_UI, fontSize: 10.5, fontWeight: 700, color: theme.textMuted, background: theme.panelAlt, borderRadius: 3, padding: "2px 7px" }}>{r.kind}</span>
            </button>))}
          {!q.trim() && <div style={{ padding: 16, fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint }}>Search spans pages, this project's activities and contractors, and your projects.</div>}
        </div>
      </div>
    </div>
  );
}


/* =========================================================================
   BACKUP & RESTORE — full JSON backup, restore (merge / replace), Excel export
   ========================================================================= */
const META_KEY = "infratrack-meta-v1";

function backupCounts(projects, tracker) {
  const c = { projects: projects.length, reports: 0, activities: 0, logs: 0, costs: 0, incidents: 0 };
  projects.forEach(p => {
    const t = normTrk(tracker[p.id]);
    c.reports += t.actuals.length; c.activities += t.activities.length; c.logs += t.actLogs.length; c.costs += t.costs.length; c.incidents += t.incidents.length;
  });
  return c;
}
function buildBackup(projects, tracker, audit) {
  return { app: "infratrack", version: 1, exportedAt: new Date().toISOString(), projects, tracker, audit };
}
function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { return { error: "This is not a valid JSON file." }; }
  if (!d || d.app !== "infratrack") return { error: "This file is not an InfraTrack backup." };
  if (!Array.isArray(d.projects) || typeof d.tracker !== "object" || d.tracker === null) return { error: "The backup is missing its projects or data." };
  const projects = d.projects.filter(p => p && typeof p.id === "string" && typeof p.name === "string");
  if (projects.length !== d.projects.length) return { error: "Some projects in the backup are damaged, so nothing was imported." };
  const tracker = {};
  projects.forEach(p => { tracker[p.id] = normTrk(d.tracker[p.id]); });
  return { data: { projects, tracker, audit: Array.isArray(d.audit) ? d.audit : [], exportedAt: d.exportedAt || null }, counts: backupCounts(projects, tracker) };
}
function exportWorkbook(projects, tracker) {
  const wb = XLSX.utils.book_new();
  const sheets = { Projects: [], "Monthly plan": [], "Daily reports": [], Activities: [], "Activity logs": [], Costs: [], Incidents: [] };
  projects.forEach(p => {
    const t = normTrk(tracker[p.id]);
    const pl = t.plan;
    sheets.Projects.push({ Project: p.name, Client: p.client, Contractor: p.contractor, "Project manager": p.pm, "Contract value": p.value, Start: pl ? pl.startDate : "", "Planned completion": pl ? pl.endDate : "", "Budget (Rs)": pl && pl.budget ? pl.budget : "", "Planned workers/day": pl ? pl.workers : "", "Planned machines/day": pl ? pl.machines : "", "Working days/week": pl ? pl.perWeek : "" });
    if (pl) pl.months.forEach(m => sheets["Monthly plan"].push({ Project: p.name, Month: m.key, "Working days": m.workingDays, "Workers/day": m.workers, "Machines/day": m.machines, "Cumulative target %": m.cum }));
    t.actuals.forEach(e => sheets["Daily reports"].push({ Project: p.name, Date: e.date, Workers: e.workers, Machines: e.machines, "Progress %": e.progress === null || e.progress === undefined ? "" : e.progress, Weather: e.weather || "", "Hours lost": e.hoursLost || 0, Reason: e.reason || "", Remarks: e.remarks || "", "Photo count (workers/machines)": e.photo ? `${e.photo.workers}/${e.photo.machines} (${e.photo.confidence}, ${e.photo.engine || "AI"})` : "" }));
    t.activities.forEach(a => sheets.Activities.push({ Project: p.name, Activity: a.name, Unit: a.unit, "Planned qty": a.plannedQty, Start: a.start, Finish: a.end, Contractor: a.contractor || "", "Budget (Rs)": a.budget || "" }));
    t.actLogs.forEach(l => sheets["Activity logs"].push({ Project: p.name, Activity: (t.activities.find(a => a.id === l.activityId) || {}).name || "", Date: l.date, "Qty done": l.qty, Note: l.note || "" }));
    t.costs.forEach(c => sheets.Costs.push({ Project: p.name, Date: c.date, Category: c.category, "Amount (Rs)": c.amount, Activity: (t.activities.find(a => a.id === c.activityId) || {}).name || "", Contractor: c.contractor || "", Note: c.note || "" }));
    t.incidents.forEach(i => sheets.Incidents.push({ Project: p.name, Date: i.date, Type: i.type, Severity: i.severity, Contractor: i.contractor || "", Status: i.status, Description: i.description }));
  });
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]), name));
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function BackupPage({ theme, projects, tracker, auditLog, backupMeta, onBackupDone, onImportData, pushToast, cloud, syncState, userEmail, onReloadCloud, onSyncNow }) {
  const [pending, setPending] = useState(null);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [localSnap, setLocalSnap] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  useEffect(() => { if (cloud) readLocalSnapshot().then(setLocalSnap).catch(() => {}); }, [cloud]);
  const localNew = localSnap ? localSnap.data.projects.filter(p => !projects.some(x => x.id === p.id)) : [];
  const counts = backupCounts(projects, tracker);
  const last = backupMeta && backupMeta.lastBackupAt ? backupMeta.lastBackupAt : null;
  const since = last ? auditLog.filter(e => e.ts && e.ts > new Date(last).getTime()).length : auditLog.length;
  const stamp = todayISO();
  const json = () => JSON.stringify(buildBackup(projects, tracker, auditLog), null, 2);

  const downloadJson = () => {
    downloadBlob(new Blob([json()], { type: "application/json" }), `infratrack-backup-${stamp}.json`);
    onBackupDone();
    pushToast("Backup opened in a new tab — save it with your browser's save option (Ctrl/Cmd + S) if it doesn't download by itself.");
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(json()); onBackupDone(); pushToast("Backup copied. Paste it into a text file and keep it somewhere safe."); }
    catch (e) { pushToast("Copy was blocked by the browser — use Download instead."); }
  };
  const downloadXlsx = () => {
    try { downloadBlob(exportWorkbook(projects, tracker), `infratrack-data-${stamp}.xlsx`); pushToast("Excel file opened in a new tab — use your browser's save option."); }
    catch (e) { pushToast("Could not build the Excel file."); }
  };
  const readText = (text, name) => {
    const r = parseBackup(text);
    if (r.error) { setError(r.error); setPending(null); return; }
    setError(""); setConfirmReplace(false); setPending({ ...r, name });
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => readText(String(rd.result || ""), f.name);
    rd.onerror = () => setError("Could not read that file.");
    rd.readAsText(f);
    e.target.value = "";
  };
  const th = thStyle(theme), td = tdStyle(theme);
  const countRows = (c) => [["Projects", c.projects], ["Daily reports", c.reports], ["Activities", c.activities], ["Activity logs", c.logs], ["Costs", c.costs], ["Incidents", c.incidents]];
  const newIds = pending ? pending.data.projects.filter(p => !projects.some(x => x.id === p.id)) : [];
  return (
    <div>
      <PageHero theme={theme} icon={Download} title="Backup & Restore" subtitle={cloud ? "Your data is saved to your account — a backup file is still a good extra copy" : "Your data lives in this browser only — keep a backup file so nothing is lost"}
        tickerItems={[last ? `Last backup ${fmtDMY(last.slice(0, 10))}` : "No backup taken yet", `${since} change${since === 1 ? "" : "s"} since the last backup`, `${counts.projects} project${counts.projects === 1 ? "" : "s"}, ${counts.reports} daily reports`]} />
      {cloud && (
        <Card theme={theme} style={{ marginBottom: 12 }}>
          <SectionTitle theme={theme} title="Cloud account" sub={`Signed in as ${userEmail || "your account"}. Your projects are stored in your private cloud space; no other account can read or change them.`} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SyncPill theme={theme} sync={syncState} />
            <Button theme={theme} small kind="subtle" onClick={onSyncNow}>Sync now</Button>
            <Button theme={theme} small kind="subtle" onClick={onReloadCloud}>Reload from cloud</Button>
          </div>
          <div style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, lineHeight: 1.5 }}>
            Changes upload automatically a moment after you make them. "Reload from cloud" replaces what is on screen with the cloud copy — use it if another device changed a project.
          </div>
          {localSnap && localNew.length > 0 && !uploaded && (
            <div style={{ marginTop: 14, border: `1px solid ${theme.accent}`, borderRadius: 3, padding: 14, background: theme.panelAlt }}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13.5, color: theme.text }}>This browser has data from before you signed in</div>
              <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, margin: "4px 0 10px", lineHeight: 1.5 }}>
                {localNew.length} project{localNew.length === 1 ? "" : "s"} not in your account yet: {localNew.slice(0, 4).map(p => p.name).join(", ")}{localNew.length > 4 ? "…" : ""}. The local copy stays here untouched. Projects already in your account are skipped. Download a backup first if you want an extra copy.
              </div>
              <Button theme={theme} icon={Plus} onClick={() => { onImportData(localSnap.data, "merge"); setUploaded(true); }}>Upload to my account</Button>
            </div>)}
          {uploaded && <div style={{ marginTop: 12, fontFamily: FONT_UI, fontSize: 12.5, color: theme.green, fontWeight: 600 }}>Uploaded — the data is now being saved to your account.</div>}
          {localSnap && localNew.length === 0 && !uploaded && <div style={{ marginTop: 12, fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint }}>Everything saved in this browser is already in your account.</div>}
        </Card>)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatTile theme={theme} label="Last backup" value={last ? fmtDMY(last.slice(0, 10)) : "Never"} sub={last ? `${since} change${since === 1 ? "" : "s"} made since` : "Take a backup now"} color={!last || since >= 20 ? theme.accent : theme.text} />
        <StatTile theme={theme} label="Data stored" value={`${counts.projects} project${counts.projects === 1 ? "" : "s"}`} sub={`${counts.reports} reports · ${counts.activities} activities · ${counts.costs} costs · ${counts.incidents} incidents`} />
        <StatTile theme={theme} label="Where it is saved" value={cloud ? "Your account" : "This browser"} sub={cloud ? "Stored in your private cloud space; available on any device you sign in from" : "Clearing browser data or switching device removes it unless you have a backup file"} />
      </div>
      <Card theme={theme} style={{ marginBottom: 12 }}>
        <SectionTitle theme={theme} title="Back up" sub="The backup file holds every project with its plan, reports, activities, costs, incidents and the audit trail" />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button theme={theme} icon={Download} onClick={downloadJson}>Download backup (.json)</Button>
          <Button theme={theme} kind="subtle" icon={FileText} onClick={copyJson}>Copy backup text</Button>
          <Button theme={theme} kind="subtle" icon={Table2} onClick={downloadXlsx}>Export to Excel (.xlsx)</Button>
        </div>
        <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 11.5, color: theme.textFaint, lineHeight: 1.5 }}>
          The Excel file is for reading and sharing (one sheet each for projects, monthly plan, daily reports, activities, logs, costs and incidents). Only the .json backup can be restored into the app.
        </div>
      </Card>
      <Card theme={theme}>
        <SectionTitle theme={theme} title="Restore" sub={cloud ? "Choose a backup file, or paste the copied backup text. In cloud mode a restore also changes the data in your account." : "Choose a backup file, or paste the copied backup text"} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <label style={{ fontFamily: FONT_UI, fontSize: 12.5, fontWeight: 700, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 3, padding: "9px 14px", cursor: "pointer", background: theme.panelAlt }}>
            Choose backup file…<input type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} />
          </label>
          <span style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textFaint }}>or</span>
        </div>
        <textarea value={paste} onChange={e => { setPaste(e.target.value); setError(""); }} placeholder="Paste backup text here" rows={4}
          style={{ ...trkInput(theme), fontFamily: FONT_MONO, fontSize: 11.5, resize: "vertical" }} className="bs-input-focus" />
        <div style={{ marginTop: 8 }}><Button theme={theme} small kind="subtle" onClick={() => paste.trim() ? readText(paste, "pasted text") : setError("Paste the backup text first.")}>Read pasted text</Button></div>
        {error && <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12, color: theme.red, fontWeight: 600 }}>{error}</div>}
        {pending && (
          <div style={{ marginTop: 14, border: `1px solid ${theme.accent}`, borderRadius: 3, padding: 14, background: theme.panelAlt }}>
            <div style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 13.5, color: theme.text }}>Backup read: {pending.name}</div>
            <div style={{ fontFamily: FONT_UI, fontSize: 12, color: theme.textMuted, margin: "2px 0 10px" }}>{pending.data.exportedAt ? `Taken on ${fmtDMY(pending.data.exportedAt.slice(0, 10))}` : "Date unknown"} · nothing has changed yet</div>
            <table style={{ borderCollapse: "collapse", marginBottom: 12 }}><thead><tr><th style={th}>Contents</th><th style={th}>In backup</th><th style={th}>In app now</th></tr></thead>
              <tbody>{countRows(pending.counts).map(([k, v], i) => (<tr key={k} style={{ borderTop: `1px solid ${theme.borderSoft}` }}><td style={{ ...td, fontFamily: FONT_UI }}>{k}</td><td style={td}>{v}</td><td style={td}>{countRows(counts)[i][1]}</td></tr>))}</tbody></table>
            <div style={{ fontFamily: FONT_UI, fontSize: 12.5, color: theme.text, lineHeight: 1.55, marginBottom: 12 }}>
              <b>Merge</b> adds the {newIds.length} project{newIds.length === 1 ? "" : "s"} that aren't in the app yet and leaves everything else as it is{pending.data.projects.length - newIds.length > 0 ? ` (${pending.data.projects.length - newIds.length} already here will be skipped)` : ""}.
              <br /><b>Replace</b> deletes everything currently in the app and loads the backup instead.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button theme={theme} icon={Plus} onClick={() => { onImportData(pending.data, "merge"); setPending(null); setPaste(""); }}>Merge into current data</Button>
              {!confirmReplace
                ? <Button theme={theme} kind="subtle" icon={Trash2} onClick={() => setConfirmReplace(true)}>Replace everything…</Button>
                : <Button theme={theme} icon={Trash2} onClick={() => { onImportData(pending.data, "replace"); setPending(null); setPaste(""); setConfirmReplace(false); }}>Yes, replace all current data</Button>}
              <Button theme={theme} kind="subtle" onClick={() => { setPending(null); setConfirmReplace(false); }}>Cancel</Button>
            </div>
          </div>)}
      </Card>
    </div>
  );
}


/* =========================================================================
   SUPABASE — cloud sync for the signed-in user
   Sign-in itself is the app's normal Supabase login (cookie session). This module only reads that session to
   call PostgREST. The URL and the publishable (anon) key come from the environment, never from this file.
   Row-Level Security on the it_* tables makes every row readable and writable only by the user who owns it.
   ========================================================================= */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let sbSession = null;
let sbClient = null;
function getSb() {
  if (!sbClient) sbClient = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return sbClient;
}

async function sbNet(path, { method = "GET", body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error("Couldn't reach the Supabase server. Check your internet connection.");
    err.network = true;
    throw err;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = data && typeof data === "object" ? (data.msg || data.message || data.error_description || data.error) : null;
    const err = new Error(msg || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data && typeof data === "object" ? (data.error_code || data.code) : null;
    throw err;
  }
  return data;
}
// The Supabase client refreshes an expiring token itself; we just ask it for the current one.
async function sbToken() {
  let sess = null;
  try { const r = await getSb().auth.getSession(); sess = r && r.data ? r.data.session : null; } catch (e) { sess = null; }
  if (!sess) { const e = new Error("Your session expired. Please sign in again."); e.auth = true; throw e; }
  sbSession = sess;
  return sess.access_token;
}
async function sbSignOut() {
  sbSession = null;
  try { await getSb().auth.signOut(); } catch (e) { /* best effort */ }
}

/* ---- PostgREST helpers ---- */
async function sbRest(method, table, { query = "", body, prefer, retried } = {}) {
  const token = await sbToken();
  try { return await sbNet(`/rest/v1/${table}${query}`, { method, body, token, headers: prefer ? { Prefer: prefer } : {} }); }
  catch (e) {
    if (e.status === 401 && !retried) { try { await getSb().auth.refreshSession(); } catch (x) { /* fall through to a fresh token read */ } await sbToken(); return sbRest(method, table, { query, body, prefer, retried: true }); }
    throw e;
  }
}
const cloudOwner = () => sbSession.user.id;
const cloudProjRow = (p, pos) => ({ owner_id: cloudOwner(), id: p.id, name: p.name, client: p.client, contractor: p.contractor, pm: p.pm, start_text: p.start, planned_text: p.planned, forecast: p.forecast, value: p.value, position: pos });
const cloudRowProj = (r) => ({ id: r.id, name: r.name, client: r.client || "—", contractor: r.contractor || "—", pm: r.pm || "—", start: r.start_text || "—", planned: r.planned_text || "—", forecast: r.forecast || "—", value: r.value || "—" });
const cloudDataRow = (t) => ({ plan: t.plan || null, actuals: t.actuals, activities: t.activities, act_logs: t.actLogs, costs: t.costs, incidents: t.incidents });
const cloudRowData = (r) => ({ plan: r.plan || null, actuals: r.actuals || [], activities: r.activities || [], actLogs: r.act_logs || [], costs: r.costs || [], incidents: r.incidents || [] });
// Snapshots (what we last confirmed is in the cloud) so we only upload what actually changed.
const cloudSnapProject = (p, pos) => JSON.stringify({ n: p.name, c: p.client, k: p.contractor, m: p.pm, s: p.start, p: p.planned, f: p.forecast, v: p.value, i: pos });
const cloudSnapData = (t) => JSON.stringify(cloudDataRow(normTrk(t)));

async function cloudLoadAll() {
  const [pr, dr, us] = await Promise.all([
    sbRest("GET", "it_projects", { query: "?select=*&order=position.asc,created_at.asc" }),
    sbRest("GET", "it_project_data", { query: "?select=*" }),
    sbRest("GET", "it_user_state", { query: "?select=*" }),
  ]);
  const projects = (pr || []).map(cloudRowProj);
  const tracker = {}, revs = {};
  projects.forEach(p => { tracker[p.id] = normTrk(null); });
  (dr || []).forEach(r => { if (tracker[r.project_id]) { tracker[r.project_id] = cloudRowData(r); revs[r.project_id] = r.rev; } });
  const st = us && us[0] ? us[0] : null;
  return { projects, tracker, revs, audit: st && Array.isArray(st.audit) ? st.audit : [], meta: st && st.meta ? st.meta : {} };
}
async function cloudUpsertProject(p, pos) {
  await sbRest("POST", "it_projects", { query: "?on_conflict=owner_id,id", body: cloudProjRow(p, pos), prefer: "resolution=merge-duplicates,return=minimal" });
}
async function cloudSaveData(pid, trk, rev) {
  const conflict = () => Object.assign(new Error("This project was changed on another device."), { conflict: true });
  if (rev === undefined || rev === null) {
    const r = await sbRest("POST", "it_project_data", { query: "?on_conflict=owner_id,project_id", body: { owner_id: cloudOwner(), project_id: pid, ...cloudDataRow(trk), rev: 1 }, prefer: "resolution=ignore-duplicates,return=representation" });
    if (Array.isArray(r) && r.length) return 1;
    throw conflict();
  }
  const r = await sbRest("PATCH", "it_project_data", { query: `?owner_id=eq.${cloudOwner()}&project_id=eq.${encodeURIComponent(pid)}&rev=eq.${rev}`, body: { ...cloudDataRow(trk), rev: rev + 1 }, prefer: "return=representation" });
  if (!Array.isArray(r) || !r.length) throw conflict();
  return rev + 1;
}
async function cloudDeleteProject(pid) {
  await sbRest("DELETE", "it_projects", { query: `?owner_id=eq.${cloudOwner()}&id=eq.${encodeURIComponent(pid)}`, prefer: "return=minimal" });
}
async function cloudSaveState(audit, meta) {
  await sbRest("POST", "it_user_state", { query: "?on_conflict=owner_id", body: { owner_id: cloudOwner(), audit: audit.slice(0, 500), meta }, prefer: "resolution=merge-duplicates,return=minimal" });
}
// What this browser had stored before cloud accounts (used by the "upload local data" button).
async function readLocalSnapshot() {
  const [t, cp, au] = await Promise.all([storeGet(TRACKER_KEY), storeGet(CUSTOM_PROJECTS_KEY), storeGet(AUDIT_KEY)]);
  if (!Array.isArray(cp) || !cp.length) return null;
  const projects = cp.filter(p => p && typeof p.id === "string" && typeof p.name === "string");
  const tracker = {};
  projects.forEach(p => { tracker[p.id] = normTrk(t && t[p.id]); });
  return { data: { projects, tracker, audit: Array.isArray(au) ? au : [] }, counts: backupCounts(projects, tracker) };
}

function SyncPill({ theme, sync }) {
  const map = {
    local: ["Local only", theme.textFaint, "Data is saved in this browser only. Sign in with an account for cloud sync."],
    loading: ["Loading cloud data…", theme.accent, "Fetching your projects from the cloud"],
    saving: ["Saving…", theme.accent, "Uploading your latest changes"],
    synced: ["Cloud synced", theme.green, sync.at ? `Last synced ${new Date(sync.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "All changes are saved"],
    error: ["Sync failed", theme.red, sync.error || "Couldn't reach the cloud. Will retry."],
    conflict: ["Needs reload", theme.red, "A project was changed on another device. Open Backup & Cloud and reload from the cloud."],
  };
  const [label, col, tip] = map[sync.status] || map.local;
  return (
    <span title={tip} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT_UI, fontSize: 11.5, fontWeight: 700, color: col, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "5px 10px", whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />{label}
    </span>
  );
}


/* =========================================================================
   LOGIN + GREETING FLOW
   (merged from InfraTrack-Login.jsx — tokens/names prefixed with "Login"/
   "LT" so they don't collide with the workspace's own THEME/FONT tokens.)
   ========================================================================= */
const LOGIN_ROLES = [
  { id: "admin", label: "Admin", icon: Shield, blurb: "Full platform & access control" },
  { id: "pm", label: "Project Manager", icon: FolderKanban, blurb: "Schedule, budget & delivery" },
  { id: "site", label: "Site Engineer", icon: HardHat, blurb: "Field capture & DPRs" },
  { id: "contractor", label: "Contractor", icon: Truck, blurb: "Package progress & crews" },
  { id: "client", label: "Client / Owner", icon: Building2, blurb: "Read-only project visibility" },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function greeting(hour) {
  if (hour >= 5 && hour < 12) return { text: "Good morning", Icon: Sun };
  if (hour >= 12 && hour < 17) return { text: "Good afternoon", Icon: Sun };
  if (hour >= 17 && hour < 21) return { text: "Good evening", Icon: CloudMoon };
  return { text: "Good night", Icon: Moon };
}

/* =========================================================================
   ROOT APP (the original workspace — renamed to `Workspace` and now takes
   the signed-in user so the Topbar can carry the greeting forward)
   ========================================================================= */
const AUDIT_KEY = "infratrack-audit-v1";

// Checks the password with a direct call, so the signed-in session is never replaced.
async function verifyCredentials(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    if (res.ok) return "ok";
    if (res.status === 400 || res.status === 401 || res.status === 422) return "wrong";
    return "error";
  } catch (e) { return "error"; }
}
function DeleteProjectModal({ theme, project, userEmail, cloud, onClose, onConfirm }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputStyle = trkInput(theme), labelStyle = trkLabel(theme);
  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!cloud || !userEmail) { setErr("Failed to delete. Sign in to your account to delete a project."); return; }
    if (!email.trim() || !pw) { setErr("Enter your email id and password."); return; }
    if (email.trim().toLowerCase() !== userEmail.toLowerCase()) { setErr("Incorrect email id or password. Failed to delete."); return; }
    setBusy(true);
    const r = await verifyCredentials(userEmail, pw);
    setBusy(false);
    if (r === "ok") onConfirm();
    else if (r === "wrong") setErr("Incorrect email id or password. Failed to delete.");
    else setErr("Failed to delete: could not check your password right now. Check your internet and try again.");
  };
  return (
    <Modal theme={theme} title="Delete project?" onClose={onClose} width={460}>
      <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
        "{project.name}" and everything entered for it (plan, daily reports, activities, costs, incidents) will be removed. This can't be undone. Enter your account email id and password to confirm.
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ marginTop: 14 }}>
        <label style={labelStyle}>Email id</label>
        <input type="email" autoComplete="username" className="bs-input-focus" style={inputStyle} value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} />
        <label style={{ ...labelStyle, marginTop: 10 }}>Password</label>
        <input type="password" autoComplete="current-password" className="bs-input-focus" style={inputStyle} value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} />
        {err && <div role="alert" style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 12.5, color: theme.red, fontWeight: 600 }}>{err}</div>}
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <Button theme={theme} icon={Trash2} kind="danger" onClick={submit}>{busy ? "Checking…" : "Delete project"}</Button>
          <Button theme={theme} kind="subtle" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

function Workspace({ signedInUser, onLogout }) {
  const isMobile = useIsMobile();
  const cloud = !!(signedInUser && signedInUser.cloud);
  const [dark, setDark] = useState(false);
  const theme = dark ? THEME.dark : THEME.light;
  useBackdrop(theme.bg);
  const [view, setViewRaw] = useState("dashboard");
  const [viewHistory, setViewHistory] = useState([]);
  const setView = useCallback((v) => {
    setViewRaw(curr => {
      if (v === curr) return curr;
      setViewHistory(h => [...h, curr]);
      return v;
    });
  }, []);
  const goBack = useCallback(() => {
    setViewHistory(h => {
      if (h.length === 0) return h;
      setViewRaw(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);
  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const project = projects.find(p => p.id === projectId) || projects[0] || null;
  const setProject = useCallback((p) => setProjectId(p.id), []);
  const projectsRef = useRef([]);
  projectsRef.current = projects;
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [role, setRole] = useState(signedInUser?.role?.label || "Project Manager");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [backupMeta, setBackupMeta] = useState({ lastBackupAt: null });

  // { [projectId]: { plan, actuals, activities, actLogs, costs, incidents } } — all entered by the user.
  const [tracker, setTracker] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const trackerRef = useRef({});
  trackerRef.current = tracker;
  const saveWarned = useRef(false);

  const pushToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);

  const auditRef = useRef([]);
  auditRef.current = auditLog;
  const metaRef = useRef({ lastBackupAt: null });
  metaRef.current = backupMeta;
  const [syncState, setSyncState] = useState({ status: cloud ? "loading" : "local", at: null, error: "" });
  const cloudRef = useRef({ projects: new Map(), data: new Map(), revs: {}, state: "", conflict: new Set(), ready: false, busy: false, dirty: false });
  const pushTimer = useRef(null);
  const syncRef = useRef(null);

  // Make the screen match a snapshot loaded from the cloud, and remember it as "already saved".
  const applyCloudSnapshot = useCallback((c) => {
    const ref = cloudRef.current;
    const meta = { lastBackupAt: (c.meta && c.meta.lastBackupAt) || null };
    ref.projects = new Map(c.projects.map((p, i) => [p.id, cloudSnapProject(p, i)]));
    ref.data = new Map(c.projects.map(p => [p.id, cloudSnapData(c.tracker[p.id])]));
    ref.revs = { ...c.revs };
    ref.state = JSON.stringify([c.audit, meta]);
    ref.conflict = new Set();
    ref.ready = true;
    projectsRef.current = c.projects; trackerRef.current = c.tracker;
    setProjects(c.projects); setTracker(c.tracker); setAuditLog(c.audit); setBackupMeta(meta);
  }, []);
  const loadCloud = useCallback(async () => {
    setSyncState(s => ({ ...s, status: "loading", error: "" }));
    try {
      const c = await cloudLoadAll();
      applyCloudSnapshot(c);
      setSyncState({ status: "synced", at: new Date().toISOString(), error: "" });
      return c;
    } catch (e) {
      if (e.auth) { pushToast("Your session expired. Please sign in again."); onLogout(); return null; }
      setSyncState({ status: "error", at: null, error: e.message });
      return null;
    }
  }, [applyCloudSnapshot, pushToast, onLogout]);

  const syncNow = useCallback(async () => {
    const c = cloudRef.current;
    if (!cloud || !c.ready) return;
    if (c.busy) { c.dirty = true; return; }
    c.busy = true; c.dirty = false;
    setSyncState(s => ({ ...s, status: "saving", error: "" }));
    let failed = null, newConflict = false;
    try {
      const projs = projectsRef.current, trk = trackerRef.current;
      for (const id of [...c.projects.keys()]) {
        if (!projs.some(p => p.id === id)) { await cloudDeleteProject(id); c.projects.delete(id); c.data.delete(id); delete c.revs[id]; c.conflict.delete(id); }
      }
      for (let i = 0; i < projs.length; i++) {
        const p = projs[i];
        const ps = cloudSnapProject(p, i);
        if (c.projects.get(p.id) !== ps) { await cloudUpsertProject(p, i); c.projects.set(p.id, ps); }
        if (c.conflict.has(p.id)) continue;
        const t = normTrk(trk[p.id]);
        const ds = cloudSnapData(t);
        if (c.data.get(p.id) !== ds) {
          try { c.revs[p.id] = await cloudSaveData(p.id, t, c.revs[p.id]); c.data.set(p.id, ds); }
          catch (e) { if (e.conflict) { c.conflict.add(p.id); newConflict = true; } else throw e; }
        }
      }
      const meta = { lastBackupAt: metaRef.current.lastBackupAt || null };
      const st = JSON.stringify([auditRef.current, meta]);
      if (c.state !== st) { await cloudSaveState(auditRef.current, meta); c.state = st; }
    } catch (e) { failed = e; }
    c.busy = false;
    if (failed) {
      if (failed.auth) { pushToast("Your session expired. Please sign in again."); onLogout(); return; }
      setSyncState({ status: "error", at: null, error: failed.message });
    } else {
      setSyncState({ status: c.conflict.size ? "conflict" : "synced", at: new Date().toISOString(), error: "" });
      if (newConflict) pushToast("A project was changed on another device. Open Backup & Cloud and reload from the cloud.");
    }
    if (c.dirty) { c.dirty = false; setTimeout(() => syncRef.current && syncRef.current(), 50); }
  }, [cloud, pushToast, onLogout]);
  syncRef.current = syncNow;

  const reloadFromCloud = useCallback(async () => {
    clearTimeout(pushTimer.current);
    const c = await loadCloud();
    if (c) { setDataLoaded(true); pushToast("Reloaded from the cloud."); }
  }, [loadCloud, pushToast]);
  const flushAndLogout = useCallback(async () => {
    clearTimeout(pushTimer.current);
    const c = cloudRef.current;
    if (cloud && c.ready) {
      for (let i = 0; i < 20 && c.busy; i++) await new Promise(r => setTimeout(r, 150));
      await syncNow();
    }
    onLogout();
  }, [cloud, syncNow, onLogout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cloud) {
        const c = await loadCloud();
        if (cancelled || !c) return;
        setDataLoaded(true);
        if (!c.projects.length) {
          const snap = await readLocalSnapshot();
          if (!cancelled && snap) pushToast("This browser has data saved from before you signed in. Open Backup & Cloud to upload it to your account.");
        }
        return;
      }
      const [t, cp, au, meta] = await Promise.all([storeGet(TRACKER_KEY), storeGet(CUSTOM_PROJECTS_KEY), storeGet(AUDIT_KEY), storeGet(META_KEY)]);
      if (cancelled) return;
      if (t && typeof t === "object") { trackerRef.current = t; setTracker(t); }
      if (Array.isArray(cp) && cp.length) setProjects(cp.filter(p => p && p.id));
      if (Array.isArray(au)) setAuditLog(au);
      if (meta && typeof meta === "object") setBackupMeta(meta);
      setDataLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Local mode: keep saving to this browser. Cloud mode: never touch the local copy (it stays as the pre-account snapshot).
  useEffect(() => {
    if (!dataLoaded || cloud) return;
    storeSet(TRACKER_KEY, tracker).then(ok => {
      if (!ok && !saveWarned.current) { saveWarned.current = true; pushToast("Couldn't save data to storage — it will be lost on refresh."); }
    });
  }, [tracker, dataLoaded, cloud, pushToast]);
  useEffect(() => { if (dataLoaded && !cloud) storeSet(CUSTOM_PROJECTS_KEY, projects); }, [projects, dataLoaded, cloud]);
  useEffect(() => { if (dataLoaded && !cloud) storeSet(AUDIT_KEY, auditLog); }, [auditLog, dataLoaded, cloud]);
  useEffect(() => { if (dataLoaded && !cloud) storeSet(META_KEY, backupMeta); }, [backupMeta, dataLoaded, cloud]);

  // Cloud mode: upload whatever changed shortly after the last edit; retry after a failure.
  useEffect(() => {
    if (!cloud || !dataLoaded || !cloudRef.current.ready) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => syncRef.current && syncRef.current(), 900);
    return () => clearTimeout(pushTimer.current);
  }, [tracker, projects, auditLog, backupMeta, cloud, dataLoaded]);
  useEffect(() => {
    if (!cloud || syncState.status !== "error") return;
    const t = setTimeout(async () => {
      if (cloudRef.current.ready) syncRef.current && syncRef.current();
      else { const c = await loadCloud(); if (c) setDataLoaded(true); }
    }, 12000);
    return () => clearTimeout(t);
  }, [cloud, syncState.status, loadCloud]);
  useEffect(() => {
    if (!cloud) return;
    const h = (e) => { if (syncState.status === "saving" || syncState.status === "error" || cloudRef.current.dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [cloud, syncState.status]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === "Escape") { setPaletteOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addAudit = useCallback((activity, from, to, source) => {
    const stamp = `${fmtDMY(todayISO())} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    setAuditLog(log => [{ activity, from, to, by: signedInUser?.name || "User", source, date: stamp, ts: Date.now() }, ...log].slice(0, 500));
  }, [signedInUser]);
  const nameOf = (id) => (projectsRef.current.find(p => p.id === id) || {}).name || "Project";

  // Apply a change to one project's data, then raise a notification for any NEW high/critical alert it causes.
  const mutate = useCallback((pid, fn, { notify = true } = {}) => {
    const prev = normTrk(trackerRef.current[pid]);
    const nextTrk = fn(prev);
    const next = { ...trackerRef.current, [pid]: nextTrk };
    trackerRef.current = next;
    setTracker(next);
    if (notify) {
      const today = todayISO();
      const before = new Set(summarizeProject(prev, today).alerts.map(a => a.key));
      const fresh = summarizeProject(nextTrk, today).alerts.filter(a => !before.has(a.key) && (a.severity === "Critical" || a.severity === "High"));
      if (fresh.length) {
        const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setNotifications(n => [...fresh.slice(0, 3).map(a => ({ id: Date.now() + Math.random(), cat: a.severity, text: `${nameOf(pid)}: ${a.title}. ${a.detail}`, time: `${fmtDMY(today)} ${stamp}`, read: false })), ...n]);
        pushToast(`New ${fresh[0].severity.toLowerCase()} alert: ${fresh[0].title}`);
      }
    }
  }, [pushToast]);

  // ---- projects ----
  const addProject = useCallback((data, plan) => {
    const np = {
      id: `p${Date.now()}`,
      name: data.name?.trim() || "Untitled Project",
      client: data.client?.trim() || "—",
      contractor: data.contractor?.trim() || "—",
      pm: data.pm?.trim() || "—",
      start: data.start?.trim() || "—",
      planned: data.planned?.trim() || "—",
      forecast: data.forecast?.trim() || "—",
      value: data.value?.trim() || "—",
    };
    projectsRef.current = [...projectsRef.current, np];
    setProjects(prev => [...prev, np]);
    setProjectId(np.id);
    setAddProjectOpen(false);
    const next = { ...trackerRef.current, [np.id]: { ...normTrk(null), plan: plan || null } };
    trackerRef.current = next; setTracker(next);
    addAudit(`Project — ${np.name}`, "—", plan ? "Created with plan" : "Created", "Project Setup");
    if (plan) { pushToast(`Project "${np.name}" created with its planned schedule and resources.`); setView("planactual"); }
    else pushToast(`Project "${np.name}" created. Add its planned data to start tracking.`);
  }, [pushToast, addAudit, setView]);

  const loadDemoProject = useCallback((kind) => {
    const demo = kind === "ayodhya" ? buildDemoProject(DEMO_AYODHYA) : kind === "sultanganj" ? buildDemoProject(makeDemoSultanganj()) : buildDemoProject();
    if (!demo) { pushToast("Couldn't build the demo project."); return; }
    const np = demo.project;
    projectsRef.current = [...projectsRef.current, np];
    setProjects(prev => [...prev, np]);
    setProjectId(np.id);
    setAddProjectOpen(false);
    const next = { ...trackerRef.current, [np.id]: demo.tracker };
    trackerRef.current = next; setTracker(next);
    addAudit(`Project — ${np.name}`, "—", "Demo project loaded with sample entries", "Project Setup");
    pushToast(kind === "ayodhya" || kind === "sultanganj" ? `Demo project "${np.name}" loaded. Project facts are from the case study; all daily figures are simulated.` : `Demo project "${np.name}" loaded — every section is filled with sample data.`);
    setView("dashboard");
  }, [pushToast, addAudit, setView]);

  const deleteProject = useCallback((id) => {
    const target = projectsRef.current.find(p => p.id === id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setProjectId(curr => (curr === id ? null : curr));
    setTracker(t => { if (!t[id]) return t; const n = { ...t }; delete n[id]; trackerRef.current = n; return n; });
    if (target) { pushToast(`Project "${target.name}" deleted.`); addAudit(`Project — ${target.name}`, "Existed", "Deleted", "Project Setup"); }
  }, [pushToast, addAudit]);

  const updateProject = useCallback((pid, patch) => {
    setProjects(prev => prev.map(p => (p.id === pid ? { ...p, ...patch } : p)));
    addAudit(`Project — ${patch.name || nameOf(pid)}`, "Details", "Edited", "Project Overview");
    pushToast("Project details updated.");
  }, [addAudit, pushToast]);

  // ---- plan + daily actuals ----
  const savePlan = useCallback((pid, plan) => {
    const had = !!normTrk(trackerRef.current[pid]).plan;
    mutate(pid, t => ({ ...t, plan }));
    pushToast(had ? "Planned data updated." : "Planned data saved.");
    addAudit(`Plan — ${nameOf(pid)}`, had ? "Previous plan" : "—", `${fmtDMY(plan.startDate)} → ${fmtDMY(plan.endDate)}, ${plan.workers} workers, ${plan.machines} machines/day`, "Planned vs Actual Tracker");
  }, [mutate, pushToast, addAudit]);
  const saveActual = useCallback((pid, entry, existed) => {
    const cur = normTrk(trackerRef.current[pid]);
    if (!cur.plan) return;
    mutate(pid, t => ({ ...t, actuals: existed ? t.actuals.map(e => (e.date === entry.date ? entry : e)) : [...t.actuals, entry] }));
    pushToast(existed ? `Report for ${fmtDMY(entry.date)} updated.` : `Actual data saved for ${fmtDMY(entry.date)}.`);
    addAudit(`Daily report — ${nameOf(pid)}`, existed ? "Previous report" : "—", `${fmtDMY(entry.date)}: ${entry.workers} workers, ${entry.machines} machines${entry.progress !== null && entry.progress !== undefined ? `, ${entry.progress}%` : ""}`, "Planned vs Actual Tracker");
  }, [mutate, pushToast, addAudit]);
  const saveActualsBulk = useCallback((pid, entries) => {
    const cur = normTrk(trackerRef.current[pid]);
    if (!cur.plan || !entries.length) return;
    const dates = new Set(entries.map(e => e.date));
    mutate(pid, t => ({ ...t, actuals: [...t.actuals.filter(e => !dates.has(e.date)), ...entries].sort((x, y) => (x.date < y.date ? -1 : 1)) }));
    pushToast(`${entries.length} daily report${entries.length === 1 ? "" : "s"} imported.`);
    addAudit(`Daily reports — ${nameOf(pid)}`, "—", `${entries.length} imported (${fmtDMY(entries[0].date)} …)`, "Data Entry");
  }, [mutate, pushToast, addAudit]);
  const deleteActual = useCallback((pid, date) => {
    mutate(pid, t => ({ ...t, actuals: t.actuals.filter(e => e.date !== date) }), { notify: false });
    pushToast(`Report for ${fmtDMY(date)} deleted.`);
    addAudit(`Daily report — ${nameOf(pid)}`, fmtDMY(date), "Deleted", "Planned vs Actual Tracker");
  }, [mutate, pushToast, addAudit]);

  // ---- activities ----
  const addActivity = useCallback((pid, a) => {
    mutate(pid, t => ({ ...t, activities: [...t.activities, a] }));
    pushToast(`Activity "${a.name}" added.`);
    addAudit(`Activity — ${a.name}`, "—", `${a.plannedQty} ${a.unit}, ${fmtDMY(a.start)} → ${fmtDMY(a.end)}`, "Activities");
  }, [mutate, pushToast, addAudit]);
  const deleteActivity = useCallback((pid, id) => {
    const a = normTrk(trackerRef.current[pid]).activities.find(x => x.id === id);
    mutate(pid, t => ({ ...t, activities: t.activities.filter(x => x.id !== id), actLogs: t.actLogs.filter(l => l.activityId !== id), costs: t.costs.map(c => (c.activityId === id ? { ...c, activityId: "" } : c)) }), { notify: false });
    if (a) { pushToast(`Activity "${a.name}" deleted.`); addAudit(`Activity — ${a.name}`, "Existed", "Deleted with its logs", "Activities"); }
  }, [mutate, pushToast, addAudit]);
  const logActivity = useCallback((pid, l) => {
    const a = normTrk(trackerRef.current[pid]).activities.find(x => x.id === l.activityId);
    mutate(pid, t => ({ ...t, actLogs: [...t.actLogs, l] }));
    pushToast(`Progress logged for ${a ? a.name : "activity"}.`);
    addAudit(`Activity — ${a ? a.name : l.activityId}`, "—", `${fmtDMY(l.date)}: +${l.qty} ${a ? a.unit : ""}`, "Activities");
  }, [mutate, pushToast, addAudit]);
  const logActivitiesBulk = useCallback((pid, logs) => {
    if (!logs.length) return;
    mutate(pid, t => ({ ...t, actLogs: [...t.actLogs, ...logs] }));
    pushToast(`Progress saved for ${logs.length} activit${logs.length === 1 ? "y" : "ies"}.`);
    addAudit(`Activity progress — ${nameOf(pid)}`, "—", `${fmtDMY(logs[0].date)}: ${logs.length} log${logs.length === 1 ? "" : "s"}`, "Data Entry");
  }, [mutate, pushToast, addAudit]);
  const deleteLog = useCallback((pid, id) => {
    mutate(pid, t => ({ ...t, actLogs: t.actLogs.filter(l => l.id !== id) }), { notify: false });
    pushToast("Progress log deleted.");
    addAudit("Activity progress log", "Existed", "Deleted", "Activities");
  }, [mutate, pushToast, addAudit]);

  // ---- cost ----
  const addCost = useCallback((pid, c) => {
    mutate(pid, t => ({ ...t, costs: [...t.costs, c] }));
    pushToast(`Cost of ${fmtMoney(c.amount)} recorded.`);
    addAudit(`Cost — ${c.category}`, "—", `${fmtDMY(c.date)}: ${fmtMoney(c.amount)}`, "Cost & Budget");
  }, [mutate, pushToast, addAudit]);
  const deleteCost = useCallback((pid, id) => {
    mutate(pid, t => ({ ...t, costs: t.costs.filter(c => c.id !== id) }), { notify: false });
    pushToast("Cost entry deleted.");
    addAudit("Cost entry", "Existed", "Deleted", "Cost & Budget");
  }, [mutate, pushToast, addAudit]);

  // ---- safety ----
  const addIncident = useCallback((pid, i) => {
    mutate(pid, t => ({ ...t, incidents: [...t.incidents, i] }));
    pushToast("Incident logged.");
    addAudit(`Safety — ${i.type}`, "—", `${fmtDMY(i.date)}: ${i.severity}`, "Safety & Site Log");
  }, [mutate, pushToast, addAudit]);
  const updateIncident = useCallback((pid, id, patch) => {
    mutate(pid, t => ({ ...t, incidents: t.incidents.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
    addAudit("Safety incident", "Status change", patch.status || "Updated", "Safety & Site Log");
  }, [mutate, addAudit]);
  const deleteIncident = useCallback((pid, id) => {
    mutate(pid, t => ({ ...t, incidents: t.incidents.filter(i => i.id !== id) }), { notify: false });
    pushToast("Incident deleted.");
    addAudit("Safety incident", "Existed", "Deleted", "Safety & Site Log");
  }, [mutate, pushToast, addAudit]);

  const onBackupDone = useCallback(() => setBackupMeta({ lastBackupAt: new Date().toISOString() }), []);
  const onImportData = useCallback((data, mode) => {
    if (mode === "replace") {
      projectsRef.current = data.projects;
      setProjects(data.projects);
      trackerRef.current = data.tracker; setTracker(data.tracker);
      if (data.audit.length) setAuditLog(data.audit);
      setProjectId(null);
      addAudit("Backup restore", "Previous data", `Replaced with ${data.projects.length} project(s)`, "Backup & Restore");
      pushToast(`Restored ${data.projects.length} project${data.projects.length === 1 ? "" : "s"} from the backup.`);
    } else {
      const fresh = data.projects.filter(p => !projectsRef.current.some(x => x.id === p.id));
      projectsRef.current = [...projectsRef.current, ...fresh];
      setProjects(prev => [...prev, ...fresh]);
      const next = { ...trackerRef.current };
      fresh.forEach(p => { next[p.id] = data.tracker[p.id]; });
      trackerRef.current = next; setTracker(next);
      addAudit("Backup restore", "—", `Merged ${fresh.length} new project(s)`, "Backup & Restore");
      pushToast(fresh.length ? `Added ${fresh.length} project${fresh.length === 1 ? "" : "s"} from the backup.` : "Nothing new to add — every project in the backup is already here.");
    }
  }, [addAudit, pushToast]);

  const backupInfo = useMemo(() => {
    const c = backupCounts(projects, tracker);
    const total = c.reports + c.activities + c.logs + c.costs + c.incidents;
    const lastTs = backupMeta.lastBackupAt ? new Date(backupMeta.lastBackupAt).getTime() : 0;
    const since = auditLog.filter(e => e.ts && e.ts > lastTs).length;
    return { total, since, never: !backupMeta.lastBackupAt, show: dataLoaded && ((!backupMeta.lastBackupAt && total >= 5) || (backupMeta.lastBackupAt && since >= 20)) };
  }, [projects, tracker, auditLog, backupMeta, dataLoaded]);

  const summary = useMemo(() => (project ? summarizeProject(tracker[project.id], todayISO()) : emptySummary()), [tracker, project]);
  const unreadCount = notifications.filter(n => !n.read).length;
  const pid = project ? project.id : null;
  const [entryFocus, setEntryFocus] = useState(null);

  const pageProps = {
    theme, project, projects, tracker, summary, setView, pushToast, userName: signedInUser?.name || "Guest",
    trackerLoaded: dataLoaded, auditLog, backupMeta, onBackupDone, onImportData, backupInfo,
    cloud, syncState, userEmail: signedInUser?.email || "", onReloadCloud: reloadFromCloud, onSyncNow: () => syncRef.current && syncRef.current(),
    onSelectProject: setProjectId,
    onEditPlan: () => setPlanModalOpen(true), onEditProject: () => setEditProjectOpen(true),
    onSavePlan: (plan) => savePlan(pid, plan),
    onSaveActual: (entry, existed) => saveActual(pid, entry, existed),
    onDeleteActual: (date) => deleteActual(pid, date),
    onSaveActualsBulk: (entries) => saveActualsBulk(pid, entries),
    onLogActivitiesBulk: (logs) => logActivitiesBulk(pid, logs),
    entryFocus, onEditEntry: (date) => { setEntryFocus(x => ({ date, n: (x ? x.n : 0) + 1 })); setView("dataentry"); },
    onAddActivity: (a) => addActivity(pid, a), onDeleteActivity: (id) => deleteActivity(pid, id),
    onLogActivity: (l) => logActivity(pid, l), onDeleteLog: (id) => deleteLog(pid, id),
    onAddCost: (c) => addCost(pid, c), onDeleteCost: (id) => deleteCost(pid, id),
    onAddIncident: (i) => addIncident(pid, i), onUpdateIncident: (id, patch) => updateIncident(pid, id, patch), onDeleteIncident: (id) => deleteIncident(pid, id),
  };

  return (
    <div className="bs-root" style={{ background: theme.bg, color: theme.text, minHeight: "100vh", fontFamily: FONT_UI, fontVariantNumeric: "tabular-nums", position: "relative" }}>
      <style>{`
        .bs-root, .bs-root *, .bs-root *::before, .bs-root *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
        .bs-root .bs-spin { animation: bsWeatherSpin 700ms linear infinite !important; }
        .bs-livedot { width: 7px; height: 7px; border-radius: 999px; background: ${theme.accent}; display: inline-block; }
        .bs-card-interactive { cursor: pointer; }
        .bs-card-interactive:hover { border-color: ${theme.accent}; }
        .bs-card-interactive:hover .bs-kpi-chevron { opacity: 1; }
        .bs-btn:hover { filter: brightness(1.08); }
        .bs-btn:active { filter: brightness(0.96); }
        .bs-icon-btn:hover { background: ${theme.panelAlt}; }
        .bs-nav-item:hover { background: ${theme.panelAlt}; }
        .bs-row { cursor: pointer; }
        .bs-row:hover { background: ${theme.panelAlt}; }
        .bs-th-sort { cursor: pointer; user-select: none; }
        .bs-th-sort:hover { color: ${theme.text} !important; }
        .bs-input-focus:focus { border-color: ${theme.accent} !important; }
        .bs-dropzone:hover { border-color: ${theme.accent} !important; background: ${theme.accentSoft}; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 0; }
        select, input, button, textarea { font-family: ${FONT_UI}; }
        input, select, textarea { border-radius: 2px; }
        button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 1px; }
      `}</style>

      <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
        {!isMobile && <Sidebar theme={theme} view={view} setView={setView} collapsed={collapsed} setCollapsed={setCollapsed} />}
        {isMobile && <BottomNav theme={theme} view={view} setView={setView} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Topbar theme={theme} dark={dark} setDark={setDark} projects={projects} project={project} setProject={setProject}
            onAddProject={() => setAddProjectOpen(true)} onLoadDemo={loadDemoProject} onLoadAyodhya={() => loadDemoProject("ayodhya")} onLoadSultanganj={() => loadDemoProject("sultanganj")} onDeleteProject={(id) => setConfirmDel(projectsRef.current.find(p => p.id === id) || null)}
            role={role} setRole={setRole} onSearch={() => setPaletteOpen(true)} onBell={() => setNotifOpen(true)} unread={unreadCount}
            userName={signedInUser?.name} onLogout={() => setConfirmLogout(true)} summary={summary} setView={setView} sync={syncState} />
          <OfflineStrip theme={theme} />
          <ReminderWatcher theme={theme} project={project} summary={summary} setView={setView} />
          <div style={{ padding: isMobile ? "12px 12px 96px" : 20, maxWidth: 1400, margin: "0 auto" }}>
            {cloud && !dataLoaded && view !== "audit" && (
              <Card theme={theme} style={{ marginTop: 20 }}>
                <div style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 700, color: theme.text }}>{syncState.status === "error" ? "Couldn't load your cloud data" : "Loading your projects from the cloud…"}</div>
                {syncState.status === "error" && (
                  <div style={{ marginTop: 8, fontFamily: FONT_UI, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5 }}>
                    {syncState.error} It will retry by itself.
                    <div style={{ marginTop: 10 }}><Button theme={theme} small onClick={reloadFromCloud}>Try again now</Button></div>
                  </div>)}
              </Card>)}
            {(!cloud || dataLoaded) && !project && view !== "audit" && view !== "backup" && view !== "about" && view !== "siteactivity" && <NoProjectScreen theme={theme} onAddProject={() => setAddProjectOpen(true)} onLoadDemo={loadDemoProject} onLoadAyodhya={() => loadDemoProject("ayodhya")} onLoadSultanganj={() => loadDemoProject("sultanganj")} />}
            {project && view === "dashboard" && <div key="dashboard" className="bs-page"><Dashboard {...pageProps} /></div>}
            {project && view === "overview" && <div key="overview" className="bs-page"><ProjectOverview {...pageProps} /></div>}
            {project && view === "dataentry" && <div key="dataentry" className="bs-page"><DataEntryPage {...pageProps} /></div>}
            {project && view === "planactual" && <div key="planactual" className="bs-page"><PlanVsActualTracker {...pageProps} tracker={summary.trk} /></div>}
            {project && view === "activities" && <div key="activities" className="bs-page"><ActivitiesPage {...pageProps} /></div>}
            {project && view === "gantt" && <div key="gantt" className="bs-page"><GanttPage {...pageProps} /></div>}
            {project && view === "cost" && <div key="cost" className="bs-page"><CostPage {...pageProps} /></div>}
            {project && view === "safety" && <div key="safety" className="bs-page"><SafetyPage {...pageProps} /></div>}
            {project && view === "delays" && <div key="delays" className="bs-page"><DelayDetection {...pageProps} /></div>}
            {project && view === "contractors" && <div key="contractors" className="bs-page"><ContractorPerformance {...pageProps} /></div>}
            {project && view === "resources" && <div key="resources" className="bs-page"><ResourceAnalytics {...pageProps} /></div>}
            {project && view === "forecast" && <div key="forecast" className="bs-page"><Forecast {...pageProps} /></div>}
            {project && view === "dpr" && <div key="dpr" className="bs-page"><DPRPage {...pageProps} /></div>}
            {project && view === "report" && <div key="report" className="bs-page"><ReportPage {...pageProps} /></div>}
            {view === "audit" && <AuditTrail theme={theme} log={auditLog} />}
            {view === "backup" && <BackupPage {...pageProps} />}
            {view === "about" && <div key="about" className="bs-page"><AboutPage theme={theme} /></div>}
            {view === "siteactivity" && <div key="siteactivity" className="bs-page"><SiteCamera theme={theme} /></div>}
          </div>
        </div>
      </div>

      <button onClick={() => setCopilotOpen(o => !o)} style={{
        position: "fixed", bottom: 20, right: 20, width: 52, height: 52, borderRadius: 999, background: theme.accent,
        border: "none", cursor: "pointer", display: copilotOpen ? "none" : "grid", placeItems: "center",
        boxShadow: "0 10px 26px #00000040", zIndex: 79,
      }}>
        <Bot size={22} color={theme.onAccent} />
      </button>

      <div style={{ position: "fixed", bottom: 74, left: 20, display: "flex", flexDirection: "row", gap: 10, zIndex: 79 }}>
        <button onClick={goBack} disabled={viewHistory.length === 0} title="Go back" className="bs-btn" style={{
          width: 44, height: 44, borderRadius: 999, background: theme.panel, border: `1px solid ${theme.border}`,
          cursor: viewHistory.length === 0 ? "default" : "pointer", display: "grid", placeItems: "center",
          boxShadow: "0 8px 22px #00000030", opacity: viewHistory.length === 0 ? 0.4 : 1,
        }}>
          <ArrowLeft size={18} color={theme.text} />
        </button>
        <button onClick={() => window.location.reload()} title="Refresh page" className="bs-btn" style={{
          width: 44, height: 44, borderRadius: 999, background: theme.panel, border: `1px solid ${theme.border}`,
          cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 8px 22px #00000030",
        }}>
          <RefreshCw size={17} color={theme.text} />
        </button>
      </div>
      <Copilot theme={theme} project={project} summary={summary} open={copilotOpen} setOpen={setCopilotOpen} />

      {paletteOpen && <CommandPalette theme={theme} onClose={() => setPaletteOpen(false)} onNavigate={setView} projects={projects} summary={summary} />}
      {notifOpen && <NotificationsDrawer theme={theme} notifications={notifications} onClose={() => setNotifOpen(false)}
        onMarkRead={(id) => setNotifications(n => n.map(x => x.id === id ? { ...x, read: true } : x))} />}
      {editProjectOpen && project && <EditProjectModal theme={theme} project={project} onClose={() => setEditProjectOpen(false)} onSave={(patch) => { updateProject(project.id, patch); setEditProjectOpen(false); }} />}
      {planModalOpen && project && <PlanEditorModal theme={theme} project={project} plan={summary.plan} onClose={() => setPlanModalOpen(false)} onSave={(p) => { savePlan(project.id, p); setPlanModalOpen(false); }} />}
      {confirmLogout && (
        <Modal theme={theme} title="Log out?" onClose={() => setConfirmLogout(false)} width={420}>
          <div style={{ fontFamily: FONT_UI, fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>Your data is saved. You will need to sign in again to open it.</div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Button theme={theme} icon={LogOut} onClick={() => { setConfirmLogout(false); flushAndLogout(); }}>Log out</Button>
            <Button theme={theme} kind="subtle" onClick={() => setConfirmLogout(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
      {confirmDel && <DeleteProjectModal theme={theme} project={confirmDel} userEmail={signedInUser?.email || ""} cloud={cloud} onClose={() => setConfirmDel(null)} onConfirm={() => { deleteProject(confirmDel.id); setConfirmDel(null); }} />}
      {addProjectOpen && <AddProjectModal theme={theme} onClose={() => setAddProjectOpen(false)} onSave={addProject} onLoadDemo={loadDemoProject} onLoadAyodhya={() => loadDemoProject("ayodhya")} onLoadSultanganj={() => loadDemoProject("sultanganj")} />}
      <Toast theme={theme} toasts={toasts} />
    </div>
  );
}

/* =========================================================================
   ERROR BOUNDARY — so a runtime hiccup after login shows a message instead
   of leaving the screen stuck on the greeting.
   ========================================================================= */
class WorkspaceBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Workspace crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12, background: "#222222", color: "#F5F1E8", fontFamily: FONT_UI, padding: 24, textAlign: "center",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Workspace failed to load</div>
          <div style={{ fontSize: 12.5, color: "#BAB5AA", maxWidth: 480, fontFamily: FONT_MONO }}>
            {String(this.state.error && this.state.error.message)}
          </div>
          <button onClick={() => this.setState({ error: null })} style={{
            marginTop: 8, padding: "9px 16px", borderRadius: 3, border: "1px solid #454545",
            background: "#2E2E2E", color: "#F5F1E8", cursor: "pointer", fontSize: 12.5,
          }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================================
   TOP-LEVEL APP — the page is already behind the Supabase login, so the signed-in user is passed in
   by the server and the workspace opens straight away.
   ========================================================================= */
export default function InfraTrack({ user }) {
  // Owner id for cloud rows; RLS rejects anything that does not equal the real auth user.
  if (!sbSession || !sbSession.user || sbSession.user.id !== user.id) sbSession = { user: { id: user.id } };
  const signedInUser = useMemo(
    () => ({ name: user.name, email: user.email, org: "", id: user.id, cloud: true, role: LOGIN_ROLES[1] }),
    [user.id, user.name, user.email],
  );
  const logout = useCallback(async () => {
    await sbSignOut();
    window.location.href = "/";
  }, []);
  return (
    <WorkspaceBoundary>
      <Workspace key={user.id} signedInUser={signedInUser} onLogout={logout} />
    </WorkspaceBoundary>
  );
}
