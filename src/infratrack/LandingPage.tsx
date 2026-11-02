// @ts-nocheck
"use client";
/* =========================================================================
   InfraTrack — Landing Page (standalone)
   Yeh woh first page hai jo Login page se pehle dikhta hai.

   Usage:
     import LandingPage from "./LandingPage";
     <LandingPage onLogin={(role, mode) => { ...navigate to your login page... }} />

   onLogin ko 2 arguments milte hain:
     role  -> null ya "admin" | "pm" | "site" | "contractor" | "client"
     mode  -> "login" ya "register"

   Dependencies:  npm i react lucide-react
   ========================================================================= */
import { useBackdrop } from "./useBackdrop";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { sendContactMessage } from "./SiteExtras";
import {
  Camera, GitMerge, AlertTriangle, Waypoints, Layers, Building2, HardHat,
  CloudRain, Truck, Wrench, Boxes, ChevronDown, ChevronLeft, ChevronRight, X,
  ArrowRight, ArrowUpRight, Mic, BadgeCheck, TrendingUp, Shield, FolderKanban,
  ArrowUp as LpUp, ArrowDown as LpDown, Menu as LpMenu, LogIn as LpLogIn,
  Sun, Moon, Search, MessageCircle, Send, Check, Plus, Minus,
} from "lucide-react";

/* ---------- fonts ---------- */
const FONT_UI = "'Manrope', 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace";

/* ---------- logo ---------- */
function InfraTrackLogo({ size = 30, radius = 8, bg, fg = "#1B1204", glow, className, animatePath }) {
  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: radius, background: bg, flexShrink: 0,
      display: "grid", placeItems: "center", boxShadow: glow ? `0 0 0 0 ${glow}` : undefined,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path d="M2.5 17.5 L8.5 10.5 L13 14 L21.5 4.5" stroke={fg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={animatePath ? "3 4" : undefined}
          style={animatePath ? { animation: "bsLogoDash 2.4s linear infinite" } : undefined} />
        <path d="M16.5 4.5 L21.5 4.5 L21.5 9.5" stroke={fg} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="2.5" cy="17.5" r="1.7" fill={fg} opacity="0.5" />
      </svg>
      {animatePath && <style>{`@keyframes bsLogoDash { to { stroke-dashoffset: -28; } }`}</style>}
    </div>
  );
}

/* ---------- colour tokens + roles ---------- */
const LT = {
  bg: "#000000",
  bgDeep: "#000000",
  panel: "#0A0A0A",
  panelBorder: "#262626",
  card: "rgba(10, 10, 10, 0.72)",
  cardBorder: "rgba(240, 169, 58, 0.16)",
  text: "#F5F5F5",
  textMuted: "#A3A3A3",
  textFaint: "#737373",
  amber: "#F0A93A",
  amberDim: "#8A6A2E",
  blue: "#5B8DEF",
  green: "#3FBE7C",
  line: "rgba(255, 255, 255, 0.14)",
};

const LOGIN_ROLES = [
  { id: "admin", label: "Admin", icon: Shield, blurb: "Full platform & access control" },
  { id: "pm", label: "Project Manager", icon: FolderKanban, blurb: "Schedule, budget & delivery" },
  { id: "site", label: "Site Engineer", icon: HardHat, blurb: "Field capture & DPRs" },
  { id: "contractor", label: "Contractor", icon: Truck, blurb: "Package progress & crews" },
  { id: "client", label: "Client / Owner", icon: Building2, blurb: "Read-only project visibility" },
];

/* ---------- mouse parallax hook ---------- */
function useMouseParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const frame = useRef(null);
  useEffect(() => {
    const handle = (e) => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        setPos({
          x: (e.clientX / window.innerWidth) - 0.5,
          y: (e.clientY / window.innerHeight) - 0.5,
        });
        frame.current = null;
      });
    };
    window.addEventListener("mousemove", handle);
    return () => {
      window.removeEventListener("mousemove", handle);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);
  return pos;
}

/* =========================================================================
   CINEMATIC HERO BACKGROUND
   Slow Ken Burns drift on every slide, 1.5 s cross-fade between slides, dark top/bottom
   gradients for legibility, light mouse parallax.
   Used by BOTH the landing page (controlled via `index`) and the login page
   (auto-advancing on its own).

   To use your own hero photos or video, replace the `src` values below.
   For a video slide use { type: "video", src: ".../file.mp4", ... }.
   ========================================================================= */
const HERO_SLIDES = [
  { type: "video", src: "/landing/city.mp4", poster: "/landing/city.jpg",
    title: "Execution intelligence for every kilometre built", cta: "Explore the platform", target: "platform" },
  { type: "video", src: "/landing/bridge.mp4", poster: "/landing/bridge.jpg",
    title: "Field evidence, linked to the schedule — automatically", cta: "See how it works", target: "expertise" },
  { type: "video", src: "/landing/aerial.mp4", poster: "/landing/aerial.jpg",
    title: "One live view of every project, every single day", cta: "See what's inside", target: "features" },
];

function HeroBackground({ slides = HERO_SLIDES, index, interval = 7000, mx = 0, my = 0, dim = 0.3 }) {
  const [auto, setAuto] = useState(0);
  const controlled = typeof index === "number";
  const active = controlled ? index : auto;

  useEffect(() => {
    if (controlled) return undefined;
    const t = setInterval(() => setAuto(v => (v + 1) % slides.length), interval);
    return () => clearInterval(t);
  }, [controlled, interval, slides.length]);

  const mediaStyle = {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
    filter: "brightness(0.78) saturate(0.7) contrast(1.04)",
  };

  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: `radial-gradient(ellipse at 30% 20%, #1a1a1a 0%, ${LT.bgDeep} 70%)`,
    }}>
      <style>{`
        @keyframes itKenBurns {
          0%   { transform: scale(1.02) translate3d(0, 0, 0); }
          100% { transform: scale(1.15) translate3d(-1.8%, -1.2%, 0); }
        }
      `}</style>

      {slides.map((s, k) => (
        <div key={k} aria-hidden="true" style={{
          position: "absolute", inset: "-3%",
          opacity: k === active ? 1 : 0,
          transition: "opacity 1100ms ease-in-out, transform 1300ms cubic-bezier(.65,.05,.2,1)",
          transform: `translate3d(${mx * -8}px, ${my * -8 + (k === active ? 0 : k < active ? -7 : 7) * (slides.length > 1 ? 1 : 0) * 10}px, 0)`,
          willChange: "opacity, transform",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            animation: "itKenBurns 16s ease-in-out infinite alternate",
            animationDelay: `${-k * 5}s`,
          }}>
            {s.type === "video" ? (
              <video src={s.src} poster={s.poster} autoPlay muted loop playsInline preload={k === 0 ? "auto" : "metadata"} style={{ ...mediaStyle, objectPosition: s.pos || "center" }} />
            ) : (
              <img src={s.src} alt="" loading={k === 0 ? "eager" : "lazy"}
                onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ ...mediaStyle, objectPosition: s.pos || "center" }} />
            )}
          </div>
        </div>
      ))}

      {/* legibility gradients — dark at the top (nav) and bottom (copy) */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0.28) 60%, rgba(0,0,0,0.82) 100%)",
      }} />
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim})` }} />
    </div>
  );
}

/* =========================================================================
   LANDING PAGE — the new first page
   Transparent header that turns
   solid on scroll, full-screen hero slider with vertical "01 / 03" counter and
   up/down arrows, count-up numbers, hover-driven sector list, project cards,
   horizontal slider, closing hero-style band and footer.
   Content is InfraTrack's own. "Login" appears in the header, the hero, the
   role cards and the closing band — each opens the login page.
   ========================================================================= */
// Colours are CSS variables so the page can switch between light and dark (see .lp-root in the style block).
const LP = {
  paper: "var(--lp-paper)", white: "var(--lp-white)", ink: "var(--lp-ink)", inkSoft: "var(--lp-soft)",
  line: "var(--lp-line)", amberText: "var(--lp-amber)", dark: "#000000", darkAlt: "#0A0A0A",
};

const LP_NAV = [
  { label: "The Platform", id: "platform", children: [["About", "platform"], ["Roles", "roles"], ["Contact", "contact"]] },
  { label: "Expertise", id: "expertise", children: [["Field Data Capture", "expertise"], ["Schedule Intelligence", "expertise"], ["Delay Detection", "expertise"]] },
  { label: "Features", id: "features", children: [["What's inside", "features"], ["Sectors", "sectors"]] },
];

const LP_FEATURES = [
  { icon: GitMerge, title: "Plan vs Actual", text: "Enter the plan once. Each day's workers, machines and progress % are compared with it, with status rules from On track to Delayed." },
  { icon: Layers, title: "Data Entry", text: "Daily report, activity quantities, cost, safety incidents, and bulk paste from Excel or CSV, with checks on every entry." },
  { icon: Waypoints, title: "Activities and Gantt", text: "Log quantity done per activity and see each one against its planned dates on a timeline." },
  { icon: TrendingUp, title: "Cost and forecast", text: "Budget vs actual cost, plus a predicted finish date worked out from the pace reported so far." },
  { icon: HardHat, title: "Safety and site log", text: "Incidents and near misses by type and severity, with weather and hours lost recorded in the daily report." },
  { icon: Camera, title: "Reports and backup", text: "Daily progress report, PDF and Excel project reports, an audit trail, and cloud sync to your own account." },
];

const LP_EXPERTISE = [
  { icon: Camera, title: "Field Data Capture", text: "Turn unstructured site evidence — photo, voice or video — into schedule-linked actual progress." },
  { icon: GitMerge, title: "Schedule Intelligence", text: "Where unstructured field evidence gets linked to the baseline schedule, activity by activity." },
  { icon: AlertTriangle, title: "Delay Detection", text: "Continuously scanning schedule-linked activity data for risk signals before they move the finish date." },
];

const LP_SECTORS = [
  { name: "Highways & Expressways", icon: Waypoints, text: "Follow earthwork, embankment, pavement and structures along the whole corridor — package by package, zone by zone." },
  { name: "Rail Corridors", icon: Layers, text: "One schedule for every contractor on the line, with verified progress instead of weekly estimates." },
  { name: "Metro & Depots", icon: Building2, text: "Keep civil, structures and utilities aligned on a single baseline across a tightly sequenced depot build." },
  { name: "Bridges & Structures", icon: HardHat, text: "Pier construction, girder erection and RCC slab casting checked against the plan the moment evidence is uploaded." },
  { name: "Drainage & Culverts", icon: CloudRain, text: "Box culvert casting and drain construction tracked with the same rigour as the critical path." },
  { name: "Pavement", icon: Truck, text: "Sub-base laying and bituminous paving progress, linked to crews, equipment and weather windows." },
  { name: "Utilities & Ducting", icon: Wrench, text: "Utility ducting and diversions visible next to the main works, so clashes show up early." },
  { name: "Earthworks", icon: Boxes, text: "Excavation and filling quantities verified from the field and rolled straight into the daily progress report." },
];

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

function Reveal({ children, delay = 0, y = 28, style }) {
  const [ref, seen] = useInView(0.12);
  return (
    <div ref={ref} style={{
      opacity: seen ? 1 : 0, transform: seen ? "none" : `translateY(${y}px)`,
      transition: `opacity 800ms cubic-bezier(.16,1,.3,1) ${delay}ms, transform 800ms cubic-bezier(.16,1,.3,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  );
}

function LpEyebrow({ children, color = LP.amberText }) {
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color, marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 28, height: 1, background: color, display: "inline-block" }} />
      {children}
    </div>
  );
}

const LP_FAQ = [
  ["Do I need an account to use InfraTrack?", "Yes. Create an account with your email and sign in. Your projects are saved to your own account, so you can open them from any device."],
  ["Who can see my project data?", "Only you. Each account's data is stored in rows that only that account can read or change."],
  ["Can I enter many daily reports at once?", "Yes. In Data Entry, paste cells from Excel or Google Sheets, or load a CSV file. Every row is checked before it is imported, and rows with problems are skipped."],
  ["How does InfraTrack decide a project is delayed?", "It compares the cumulative progress reported with the planned progress for the same day. Two points behind is At Risk, six points behind is Delayed, and four points ahead is Ahead."],
  ["What can I export?", "The daily progress report, the project report as PDF and Excel, and the plan vs actual table as CSV. A full backup of your data can be saved from Backup & Cloud."],
  ["Which languages are supported?", "English and Hindi."],
  ["Does it work on a phone?", "The workspace has a layout and a bottom menu for small screens, so daily entries can be made from site."],
];

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);
  return p;
}

function FaqSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" style={{ background: LP.paper, padding: `clamp(70px, 9vw, 120px) clamp(20px, 6vw, 96px)` }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Reveal>
          <LpEyebrow>FAQ</LpEyebrow>
          <h2 style={{ fontSize: "clamp(28px, 3.6vw, 52px)", fontWeight: 300, lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 36px" }}>Questions people ask first.</h2>
        </Reveal>
        <div>
          {LP_FAQ.map(([q, a], i) => (
            <div key={q} style={{ borderBottom: `1px solid ${LP.line}` }}>
              <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left",
                background: "none", border: "none", cursor: "pointer", color: LP.ink, padding: "22px 2px", fontSize: 18, fontWeight: 500, fontFamily: FONT_UI,
              }}>
                <span>{q}</span>
                {open === i ? <Minus size={20} color={LT.amber} /> : <Plus size={20} color={LT.amber} />}
              </button>
              {open === i && <div id={`faq-${i}`} className="lp-fade" style={{ padding: "0 2px 24px", fontSize: 15.5, lineHeight: 1.75, color: LP.inkSoft, maxWidth: 760 }}>{a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SearchOverlay({ items, onPick, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items.slice(0, 8);
    return items.filter(i => (i.title + " " + i.text).toLowerCase().includes(t)).slice(0, 8);
  }, [q, items]);
  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-label="Search this site" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "12vh 16px 0" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 100%)", background: LP.white, color: LP.ink, borderRadius: 10, boxShadow: "0 30px 80px rgba(0,0,0,0.4)", overflow: "hidden", border: `1px solid ${LP.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${LP.line}` }}>
          <Search size={18} color={LP.inkSoft} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features, FAQ, sections…" aria-label="Search"
            style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 16, color: LP.ink, fontFamily: FONT_UI }} />
          <button type="button" onClick={onClose} aria-label="Close search" style={{ background: "none", border: "none", cursor: "pointer", color: LP.inkSoft }}><X size={18} /></button>
        </div>
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {hits.length === 0 && <div style={{ padding: 22, fontSize: 14, color: LP.inkSoft }}>Nothing found for "{q}".</div>}
          {hits.map((h, i) => (
            <button key={h.title + i} type="button" onClick={() => onPick(h.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "12px 18px", borderBottom: `1px solid ${LP.line}`, fontFamily: FONT_UI }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: LP.ink }}>{h.title}</div>
              <div style={{ fontSize: 12.5, color: LP.inkSoft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.group} · {h.text}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactFab() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [err, setErr] = useState("");
  const [bad, setBad] = useState({});
  const field = { width: "100%", padding: "10px 12px", borderRadius: 6, fontSize: 14, fontFamily: FONT_UI, background: LP.paper, color: LP.ink, outline: "none" };
  const border = (k) => `1px solid ${bad[k] ? "#D64545" : LP.line}`;
  const submit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    const b = {};
    if (!f.name.trim()) b.name = true;
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) b.email = true;
    if (f.message.trim().length < 5) b.message = true;
    setBad(b);
    if (Object.keys(b).length) { setErr(b.name ? "Enter your name." : b.email ? "Enter a valid email address." : "Write a message of at least 5 characters."); setStatus("error"); return; }
    if (f.website) { setStatus("sent"); return; } // hidden field: a bot filled it, pretend success
    setStatus("sending"); setErr("");
    const r = await sendContactMessage(f);
    if (r.ok) { setStatus("sent"); setF({ name: "", email: "", message: "", website: "" }); }
    else { setStatus("error"); setErr(r.error); }
  };
  return (
    <div className="no-print">
      {open && (
        <div role="dialog" aria-label="Contact us" className="lp-fade" style={{ position: "fixed", right: 22, bottom: 150, zIndex: 80, width: "min(360px, calc(100vw - 32px))", background: LP.white, color: LP.ink, border: `1px solid ${LP.line}`, borderRadius: 12, boxShadow: "0 24px 60px rgba(0,0,0,0.35)", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Contact us</div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: LP.inkSoft }}><X size={18} /></button>
          </div>
          {status === "sent" ? (
            <div role="status" style={{ textAlign: "center", padding: "18px 4px 6px" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#3FBE7C22", display: "grid", placeItems: "center", margin: "0 auto 12px" }}><Check size={24} color="#3FBE7C" /></div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Message sent</div>
              <div style={{ fontSize: 13.5, color: LP.inkSoft, margin: "6px 0 16px" }}>Thank you. We will read it soon.</div>
              <button type="button" className="lp-btn" onClick={() => setStatus("idle")} style={{ padding: "9px 18px", borderRadius: 6, border: `1px solid ${LP.line}`, background: "none", color: LP.ink, cursor: "pointer", fontWeight: 600 }}>Send another</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <input aria-label="Your name" placeholder="Your name" value={f.name} aria-invalid={!!bad.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setBad({ ...bad, name: false }); }} style={{ ...field, border: border("name"), marginBottom: 10 }} />
              <input aria-label="Your email" type="email" placeholder="Your email" value={f.email} aria-invalid={!!bad.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setBad({ ...bad, email: false }); }} style={{ ...field, border: border("email"), marginBottom: 10 }} />
              <textarea aria-label="Message" placeholder="How can we help?" rows={4} value={f.message} aria-invalid={!!bad.message} onChange={(e) => { setF({ ...f, message: e.target.value }); setBad({ ...bad, message: false }); }} style={{ ...field, border: border("message"), resize: "vertical" }} />
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
              {status === "error" && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "#D64545", fontWeight: 600 }}>{err}</div>}
              <button type="submit" disabled={status === "sending"} className="lp-btn" style={{ marginTop: 12, width: "100%", padding: "11px 0", borderRadius: 6, border: "none", background: LT.amber, color: "#1B1204", fontWeight: 700, fontSize: 14, cursor: status === "sending" ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: status === "sending" ? 0.7 : 1 }}>
                <Send size={15} /> {status === "sending" ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      )}
      <button type="button" aria-label={open ? "Close contact form" : "Contact us"} onClick={() => setOpen(o => !o)} style={{
        position: "fixed", right: 22, bottom: 84, zIndex: 80, width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
        background: "#0A0A0A", color: LT.amber, display: "grid", placeItems: "center", boxShadow: "0 10px 26px rgba(0,0,0,0.35)", outline: `2px solid ${LT.amber}`,
      }}>
        <MessageCircle size={22} />
      </button>
    </div>
  );
}

function LandingPage({ onLogin, updated }) {
  const { x: mx, y: my } = useMouseParallax();
  const N = HERO_SLIDES.length;
  const INTERVAL = 7000;
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDrop, setOpenDrop] = useState(null);
  const [sector, setSector] = useState(0);
  const rolesRef = useRef(null);
  const [dark, setDark] = useState(false);
  useBackdrop(dark ? "#000000" : "#FFFFFF");
  const [searchOpen, setSearchOpen] = useState(false);
  const progress = useScrollProgress();
  useEffect(() => { try { if (window.localStorage.getItem("infratrack-landing-theme") === "dark") setDark(true); } catch (e) { /* no storage */ } }, []);
  const toggleDark = () => setDark(d => { const n = !d; try { window.localStorage.setItem("infratrack-landing-theme", n ? "dark" : "light"); } catch (e) { /* ignore */ } return n; });
  const searchItems = useMemo(() => [
    ...[["The platform", "platform"], ["Expertise", "expertise"], ["Features", "features"], ["Sectors", "sectors"], ["Roles", "roles"], ["FAQ", "faq"]].map(([t, id]) => ({ title: t, group: "Section", id, text: "Jump to this section" })),
    ...LP_FEATURES.map(f => ({ title: f.title, group: "Feature", id: "features", text: f.text })),
    ...LP_FAQ.map(([q, a]) => ({ title: q, group: "FAQ", id: "faq", text: a })),
  ], []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => setSlide(s => (s + 1) % N), INTERVAL);
    return () => clearTimeout(t);
  }, [slide, paused, N]);

  const go = (id) => {
    setMenuOpen(false); setOpenDrop(null);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openLogin = (role, mode) => onLogin(role, mode);
  const scrollRoles = (dir) => { if (rolesRef.current) rolesRef.current.scrollBy({ left: dir * 340, behavior: "smooth" }); };

  const hs = HERO_SLIDES[slide];
  const pad = "clamp(20px, 6vw, 96px)";
  const h2 = { fontSize: "clamp(28px, 3.6vw, 52px)", fontWeight: 300, lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 22px" };
  const ghostBtn = (dark) => ({
    padding: "13px 26px", borderRadius: 4, cursor: "pointer", fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 600,
    letterSpacing: 0.3, background: "transparent", color: dark ? "#fff" : LP.ink,
    border: `1px solid ${dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.35)"}`,
  });
  const amberBtn = {
    padding: "13px 26px", borderRadius: 4, cursor: "pointer", fontFamily: FONT_UI, fontSize: 13.5, fontWeight: 700,
    letterSpacing: 0.3, background: LT.amber, color: "#1B1204", border: "1px solid " + LT.amber,
    display: "inline-flex", alignItems: "center", gap: 8,
  };

  return (
    <div className="lp-root" data-theme={dark ? "dark" : "light"} style={{ background: LP.white, color: LP.ink, fontFamily: FONT_UI, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');
        .lp-root { --lp-paper: #F6F5F2; --lp-white: #FFFFFF; --lp-ink: #111111; --lp-soft: #525252; --lp-line: #E3E1DB; --lp-amber: #B77012; --lp-header: rgba(255,255,255,0.97); color-scheme: light; }
        .lp-root[data-theme="dark"] { --lp-paper: #0A0A0A; --lp-white: #000000; --lp-ink: #F5F5F5; --lp-soft: #A3A3A3; --lp-line: #262626; --lp-amber: #F0A93A; --lp-header: rgba(0,0,0,0.96); color-scheme: dark; }
        .lp-root * { box-sizing: border-box; }
        @media print { .lp-root { --lp-white: #fff; --lp-paper: #fff; --lp-ink: #000; --lp-soft: #333; } #top { height: auto !important; min-height: 0 !important; } }
        .lp-root button { font-family: ${FONT_UI}; }
        @keyframes lpRise { from { opacity: 0; transform: translateY(38px); } to { opacity: 1; transform: none; } }
        @keyframes lpFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes lpBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
        @keyframes lpDash { to { stroke-dashoffset: -60; } }
        @keyframes lpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .lp-rise { animation: lpRise 950ms cubic-bezier(.16,1,.3,1) both; }
        .lp-fade { animation: lpFade 450ms ease both; }
        .lp-btn { transition: transform 160ms ease, filter 160ms ease, background 160ms ease, color 160ms ease; }
        .lp-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
        .lp-link { background: none; border: none; color: inherit; cursor: pointer; padding: 0 0 6px; font-size: 14px; font-weight: 600;
          letter-spacing: 0.4px; display: inline-flex; align-items: center; gap: 10px; border-bottom: 1px solid currentColor; }
        .lp-link svg { transition: transform 200ms ease; }
        .lp-link:hover svg { transform: translateX(5px); }
        .lp-ctl { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.45); background: rgba(0,0,0,0.25);
          color: #fff; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(4px); transition: background 160ms, border-color 160ms, transform 160ms; }
        .lp-ctl:hover { background: ${LT.amber}; border-color: ${LT.amber}; color: #1B1204; transform: scale(1.06); }
        .lp-nav-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; font-weight: 600; letter-spacing: 0.3px; padding: 10px 4px; position: relative; }
        .lp-nav-btn::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: 4px; height: 2px; background: ${LT.amber}; transform: scaleX(0); transform-origin: left; transition: transform 240ms ease; }
        .lp-nav-btn:hover::after { transform: scaleX(1); }
        .lp-card { transition: transform 280ms cubic-bezier(.16,1,.3,1), box-shadow 280ms ease, border-color 280ms ease; }
        .lp-card:hover { transform: translateY(-6px); box-shadow: 0 22px 44px rgba(0,0,0,0.14); border-color: ${LT.amber} !important; }
        .lp-sector { display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; text-align: left; background: none; border: none;
          border-bottom: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.62); padding: 18px 4px; font-size: clamp(16px, 1.6vw, 21px); font-weight: 400; cursor: pointer;
          transition: color 200ms ease, padding-left 240ms ease; }
        .lp-sector:hover, .lp-sector.on { color: #fff; padding-left: 14px; }
        .lp-sector.on { border-bottom-color: ${LT.amber}; }
        .lp-slider { display: flex; gap: 20px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 6px; }
        .lp-slider::-webkit-scrollbar { display: none; }
        .lp-footlink { color: rgba(255,255,255,0.66); background: none; border: none; cursor: pointer; padding: 5px 0; font-size: 14px; text-align: left; transition: color 160ms; }
        .lp-footlink:hover { color: ${LT.amber}; }
        @media (max-width: 960px) {
          .lp-desktop { display: none !important; }
          .lp-grid-2, .lp-grid-3, .lp-grid-sector { grid-template-columns: 1fr !important; }
          .lp-counter { display: none !important; }
        }
        @media (min-width: 961px) { .lp-mobile { display: none !important; } }
      `}</style>

      {/* ------------------------------------------------ HEADER */}
      <div className="no-print" aria-hidden="true" style={{ position: "fixed", top: 0, left: 0, height: 3, width: `${progress * 100}%`, background: LT.amber, zIndex: 70, transition: "width 80ms linear" }} />
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 60,
        background: scrolled ? "var(--lp-header)" : "transparent",
        color: scrolled ? LP.ink : "#fff",
        boxShadow: scrolled ? "0 1px 0 rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)" : "none",
        backdropFilter: scrolled ? "blur(10px)" : "none",
        transition: "background 320ms ease, color 320ms ease, box-shadow 320ms ease",
      }}>
        <div style={{
          maxWidth: 1560, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
          padding: `${scrolled ? 12 : 22}px ${pad}`, transition: "padding 320ms ease",
        }}>
          <button type="button" onClick={() => go("top")} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}>
            <InfraTrackLogo size={34} radius={9} bg={LT.amber} />
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>InfraTrack</span>
          </button>

          <nav className="lp-desktop" style={{ display: "flex", alignItems: "center", gap: 30 }}>
            {LP_NAV.map(item => (
              <div key={item.id} style={{ position: "relative" }}
                onMouseEnter={() => setOpenDrop(item.id)} onMouseLeave={() => setOpenDrop(null)}>
                <button type="button" className="lp-nav-btn" onClick={() => go(item.id)}>
                  {item.label} <ChevronDown size={13} style={{ verticalAlign: -2, opacity: 0.7 }} />
                </button>
                {openDrop === item.id && (
                  <div className="lp-fade" style={{
                    position: "absolute", top: "100%", left: -14, minWidth: 230, background: LP.white, color: LP.ink, borderRadius: 6,
                    padding: 8, boxShadow: "0 18px 40px rgba(0,0,0,0.18)", border: `1px solid ${LP.line}`,
                  }}>
                    {item.children.map(([label, target]) => (
                      <button key={label} type="button" onClick={() => go(target)} style={{
                        display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
                        padding: "10px 14px", fontSize: 13.5, fontWeight: 500, color: LP.ink, borderRadius: 4,
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = LP.paper; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" aria-label="Search this site" onClick={() => setSearchOpen(true)} className="lp-ctl" style={{ width: 38, height: 38, color: "inherit", borderColor: "currentColor", opacity: 0.85 }}><Search size={16} /></button>
            <button type="button" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDark} className="lp-ctl" style={{ width: 38, height: 38, color: "inherit", borderColor: "currentColor", opacity: 0.85 }}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button type="button" className="lp-btn" onClick={() => openLogin()} style={{ ...amberBtn, padding: "10px 20px" }}>
              <LpLogIn size={15} /> Login
            </button>
          </nav>

          <div className="lp-mobile" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" aria-label="Search this site" onClick={() => setSearchOpen(true)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 6, display: "grid", placeItems: "center" }}><Search size={20} /></button>
            <button type="button" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDark} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 6, display: "grid", placeItems: "center" }}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button type="button" className="lp-btn" onClick={() => openLogin()} style={{ ...amberBtn, padding: "9px 16px" }}>
              <LpLogIn size={14} /> Login
            </button>
            <button type="button" aria-label="Menu" onClick={() => setMenuOpen(o => !o)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "grid", placeItems: "center", padding: 6 }}>
              {menuOpen ? <X size={24} /> : <LpMenu size={24} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lp-mobile lp-fade" style={{ background: LP.white, color: LP.ink, padding: "8px 24px 20px", borderTop: `1px solid ${LP.line}` }}>
            {LP_NAV.map(item => (
              <button key={item.id} type="button" onClick={() => go(item.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 0", fontSize: 16, fontWeight: 600, color: LP.ink, borderBottom: `1px solid ${LP.line}` }}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div id="main" tabIndex={-1} />
      {/* ------------------------------------------------ HERO */}
      <section id="top" style={{ position: "relative", height: "100vh", minHeight: 620, overflow: "hidden", color: "#fff" }}>
        <HeroBackground index={slide} mx={mx} my={my} dim={0.16} />

        <div style={{ position: "absolute", left: pad, right: pad, bottom: "clamp(100px, 17vh, 180px)", zIndex: 2, maxWidth: 820 }}>
          <div key={slide} className="lp-rise">
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: LT.amber, marginBottom: 20 }}>
              InfraTrack · Execution intelligence
            </div>
            <h1 style={{ fontSize: "clamp(36px, 5.6vw, 80px)", fontWeight: 300, lineHeight: 1.04, letterSpacing: "-0.025em", margin: "0 0 34px" }}>
              {hs.title}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
              <button type="button" className="lp-link" onClick={() => go(hs.target)}>
                {hs.cta} <ArrowRight size={16} />
              </button>
              <button type="button" className="lp-btn" onClick={() => openLogin()} style={amberBtn}>
                <LpLogIn size={15} /> Login
              </button>
            </div>
          </div>
        </div>

        {/* vertical counter with up / down arrows */}
        <div className="lp-counter" style={{
          position: "absolute", right: "clamp(18px, 3vw, 48px)", top: "50%", transform: "translateY(-50%)", zIndex: 3,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <button type="button" className="lp-ctl" aria-label="Previous slide" onClick={() => setSlide(s => (s - 1 + N) % N)}><LpUp size={17} /></button>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, textAlign: "center", lineHeight: 1.7, letterSpacing: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{String(slide + 1).padStart(2, "0")}</div>
            <div style={{ width: 22, height: 1, background: "rgba(255,255,255,0.6)", margin: "2px auto" }} />
            <div style={{ opacity: 0.7 }}>{String(N).padStart(2, "0")}</div>
          </div>
          <button type="button" className="lp-ctl" aria-label="Next slide" onClick={() => setSlide(s => (s + 1) % N)}><LpDown size={17} /></button>
        </div>

        {/* progress segments */}
        <div style={{ position: "absolute", left: pad, right: pad, bottom: 34, zIndex: 3, display: "flex", alignItems: "center", gap: 10, maxWidth: 420 }}>
          {HERO_SLIDES.map((_, k) => (
            <button key={k} type="button" aria-label={`Slide ${k + 1}`} onClick={() => setSlide(k)} style={{ flex: 1, height: 18, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
              <span style={{ display: "block", width: "100%", height: 2, background: "rgba(255,255,255,0.28)", position: "relative", overflow: "hidden" }}>
                {k < slide && <span style={{ position: "absolute", inset: 0, background: "#fff" }} />}
                {k === slide && (
                  <span key={`${slide}-${paused}`} style={{
                    position: "absolute", inset: 0, background: LT.amber, transformOrigin: "left",
                    animation: `lpFill ${INTERVAL}ms linear forwards`, animationPlayState: paused ? "paused" : "running",
                  }} />
                )}
              </span>
            </button>
          ))}
        </div>

        {/* scroll cue */}
        <button type="button" onClick={() => go("platform")} aria-label="Scroll down" style={{
          position: "absolute", left: "50%", bottom: 22, marginLeft: -16, zIndex: 3, background: "none", border: "none", color: "#fff", cursor: "pointer",
          animation: "lpBob 2s ease-in-out infinite", opacity: 0.85,
        }}>
          <ChevronDown size={32} />
        </button>
      </section>

      {/* ------------------------------------------------ WELCOME */}
      <section id="platform" style={{ background: LP.white, padding: `clamp(70px, 10vw, 140px) ${pad}` }}>
        <div className="lp-grid-2" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "clamp(36px, 7vw, 110px)", alignItems: "center" }}>
          <Reveal>
            <LpEyebrow>Welcome</LpEyebrow>
            <h2 style={h2}>Every excavation, pour and delay — tracked before the report lands.</h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.75, color: LP.inkSoft, maxWidth: 560, margin: "0 0 14px" }}>
              InfraTrack is an execution-intelligence platform for large infrastructure projects. It links raw site evidence to the baseline schedule so everyone sees the same, verified progress.
            </p>
            <p style={{ fontSize: 16.5, lineHeight: 1.75, color: LP.inkSoft, maxWidth: 560, margin: "0 0 34px" }}>
              One workspace for admins, project managers, site engineers, contractors and clients — in real time.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button type="button" className="lp-btn" onClick={() => go("expertise")} style={ghostBtn(false)}>Our expertise</button>
              <button type="button" className="lp-btn" onClick={() => openLogin()} style={amberBtn}><LpLogIn size={15} /> Login</button>
            </div>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: `1px solid ${LP.line}`, borderLeft: `1px solid ${LP.line}` }}>
            {[
              { n: "5", label: "ways to enter site data: daily report, activity progress, cost, safety and Excel paste" },
              { n: "16", label: "workspace pages, from dashboard and Gantt to delay detection and forecast" },
              { n: "3", label: "report formats: PDF, Excel and CSV" },
              { n: "2", label: "languages: English and Hindi" },
            ].map((x, i) => (
              <div key={x.n + i} style={{ padding: "clamp(22px, 3vw, 40px)", borderRight: `1px solid ${LP.line}`, borderBottom: `1px solid ${LP.line}` }}>
                <div style={{ fontSize: "clamp(30px, 3.6vw, 52px)", fontWeight: 300, letterSpacing: "-0.02em", color: i === 0 ? LP.amberText : LP.ink }}>{x.n}</div>
                <div style={{ fontSize: 13, color: LP.inkSoft, marginTop: 8, lineHeight: 1.5 }}>{x.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ PIONEERING BAND */}
      <section style={{ background: LP.dark, color: "#fff", padding: `clamp(56px, 7vw, 96px) ${pad}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <Reveal><h2 style={{ ...h2, textAlign: "center", marginBottom: 50 }}>Built for how sites actually run</h2></Reveal>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { icon: Mic, title: "Capture anything", text: "Photos, voice notes and video from the field — no forms to fill." },
              { icon: BadgeCheck, title: "Compare with the plan", text: "Every day's workers, machines and progress are checked against the plan." },
              { icon: TrendingUp, title: "Forecast the finish", text: "A predicted completion date, worked out from the pace of progress reported so far." },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 120}>
                <div style={{ padding: 30, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, background: "rgba(255,255,255,0.03)", height: "100%" }}>
                  <f.icon size={26} color={LT.amber} />
                  <div style={{ fontSize: 19, fontWeight: 600, margin: "18px 0 8px" }}>{f.title}</div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.65, color: "rgba(255,255,255,0.68)" }}>{f.text}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ EXPERTISE */}
      <section id="expertise" style={{ background: LP.paper, padding: `clamp(70px, 10vw, 140px) ${pad}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div className="lp-grid-2" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "clamp(30px, 6vw, 90px)", alignItems: "end", marginBottom: 56 }}>
            <Reveal>
              <LpEyebrow>Expertise</LpEyebrow>
              <h2 style={{ ...h2, marginBottom: 0 }}>Site reality, turned into one live schedule.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontSize: 16.5, lineHeight: 1.75, color: LP.inkSoft, margin: "0 0 22px" }}>
                We excel at the unglamorous part of delivery: getting trustworthy progress out of a noisy site and into the plan, quickly.
              </p>
              <button type="button" className="lp-link" onClick={() => openLogin()} style={{ color: LP.ink }}>More on the platform <ArrowRight size={16} /></button>
            </Reveal>
          </div>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {LP_EXPERTISE.map((e, i) => (
              <Reveal key={e.title} delay={i * 120}>
                <div className="lp-card" style={{ background: LP.white, border: `1px solid ${LP.line}`, borderRadius: 8, padding: "34px 30px 30px", height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 54 }}>
                    <e.icon size={30} color={LP.amberText} />
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: "#9A9A9A" }}>0{i + 1}</span>
                  </div>
                  <div style={{ fontSize: 23, fontWeight: 500, marginBottom: 12, letterSpacing: "-0.01em" }}>{e.title}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: LP.inkSoft, flex: 1 }}>{e.text}</div>
                  <button type="button" className="lp-link" onClick={() => openLogin()} style={{ color: LP.amberText, marginTop: 26, alignSelf: "flex-start" }}>
                    More on {e.title} <ArrowRight size={15} />
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ SECTORS */}
      <section id="sectors" style={{ background: LP.dark, color: "#fff", padding: `clamp(70px, 10vw, 140px) ${pad}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <Reveal>
            <LpEyebrow color={LT.amber}>Sectors</LpEyebrow>
            <h2 style={{ ...h2, maxWidth: 760 }}>Innovation has no limits — and neither do the sites we follow.</h2>
          </Reveal>
          <div className="lp-grid-sector" style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: "clamp(30px, 6vw, 90px)", marginTop: 40, alignItems: "start" }}>
            <div>
              {LP_SECTORS.map((s, i) => (
                <button key={s.name} type="button" className={`lp-sector${i === sector ? " on" : ""}`}
                  onMouseEnter={() => setSector(i)} onClick={() => setSector(i)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, opacity: 0.55 }}>0{i + 1}</span>
                    {s.name}
                  </span>
                  <ArrowUpRight size={18} style={{ opacity: i === sector ? 1 : 0, color: LT.amber, transition: "opacity 200ms" }} />
                </button>
              ))}
            </div>
            <div key={sector} className="lp-fade" style={{
              position: "sticky", top: 110, border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "clamp(26px, 3.4vw, 46px)",
              background: `linear-gradient(160deg, rgba(240,169,58,0.10), rgba(255,255,255,0.02) 55%)`, minHeight: 340,
            }}>
              {React.createElement(LP_SECTORS[sector].icon, { size: 46, color: LT.amber, strokeWidth: 1.4 })}
              <div style={{ fontSize: "clamp(24px, 2.6vw, 36px)", fontWeight: 300, margin: "26px 0 14px", letterSpacing: "-0.015em" }}>{LP_SECTORS[sector].name}</div>
              <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(255,255,255,0.74)", margin: "0 0 26px" }}>{LP_SECTORS[sector].text}</p>
              <button type="button" className="lp-link" onClick={() => openLogin()}>Login to start <ArrowRight size={16} /></button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ FEATURES */}
      <section id="features" style={{ background: LP.white, padding: `clamp(70px, 10vw, 140px) ${pad}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <Reveal>
            <LpEyebrow>What's inside</LpEyebrow>
            <h2 style={{ ...h2, maxWidth: 720, marginBottom: 50 }}>Everything a site team reports, in one workspace.</h2>
          </Reveal>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
            {LP_FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 120}>
                <div className="lp-card" style={{ background: LP.white, border: `1px solid ${LP.line}`, borderRadius: 8, padding: "30px 28px", height: "100%" }}>
                  <f.icon size={28} color={LP.amberText} strokeWidth={1.6} />
                  <div style={{ fontSize: 20, fontWeight: 500, margin: "22px 0 10px" }}>{f.title}</div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.7, color: LP.inkSoft }}>{f.text}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ ROLES SLIDER */}
      <section id="roles" style={{ background: LP.paper, padding: `clamp(70px, 9vw, 120px) ${pad}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 24, flexWrap: "wrap", marginBottom: 40 }}>
            <Reveal>
              <LpEyebrow>The workspace</LpEyebrow>
              <h2 style={{ ...h2, marginBottom: 0, maxWidth: 680 }}>One schedule, five points of view.</h2>
            </Reveal>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" aria-label="Previous" onClick={() => scrollRoles(-1)} style={{ width: 46, height: 46, borderRadius: "50%", border: `1px solid ${LP.line}`, background: LP.white, color: LP.ink, cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronLeft size={20} /></button>
              <button type="button" aria-label="Next" onClick={() => scrollRoles(1)} style={{ width: 46, height: 46, borderRadius: "50%", border: `1px solid ${LP.line}`, background: LP.white, color: LP.ink, cursor: "pointer", display: "grid", placeItems: "center" }}><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="lp-slider" ref={rolesRef}>
            {LOGIN_ROLES.map((r) => (
              <div key={r.id} className="lp-card" style={{ flex: "0 0 min(320px, 82vw)", scrollSnapAlign: "start", background: LP.white, border: `1px solid ${LP.line}`, borderRadius: 8, padding: 30, display: "flex", flexDirection: "column", minHeight: 280 }}>
                <r.icon size={32} color={LP.amberText} strokeWidth={1.6} />
                <div style={{ fontSize: 22, fontWeight: 500, margin: "34px 0 8px" }}>{r.label}</div>
                <div style={{ fontSize: 14.5, color: LP.inkSoft, lineHeight: 1.6, flex: 1 }}>{r.blurb}</div>
                <button type="button" className="lp-link" onClick={() => openLogin(r.id)} style={{ color: LP.amberText, alignSelf: "flex-start", marginTop: 22 }}>
                  Login as {r.label} <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection />

      {/* ------------------------------------------------ CLOSING BAND */}
      <section style={{ position: "relative", overflow: "hidden", color: "#fff", padding: `clamp(90px, 13vw, 180px) ${pad}` }}>
        <HeroBackground slides={[HERO_SLIDES[1]]} dim={0.5} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 1320, margin: "0 auto" }}>
          <Reveal>
            <LpEyebrow color={LT.amber}>Get started</LpEyebrow>
            <h2 style={{ ...h2, fontSize: "clamp(32px, 4.6vw, 66px)", maxWidth: 800 }}>Your next site review starts here.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", maxWidth: 560, margin: "0 0 34px" }}>
              Sign in to see verified progress, delays and forecasts for your project — or create an account for your team.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button type="button" className="lp-btn" onClick={() => openLogin()} style={{ ...amberBtn, padding: "15px 32px", fontSize: 14.5 }}><LpLogIn size={16} /> Login</button>
              <button type="button" className="lp-btn" onClick={() => openLogin(null, "register")} style={{ ...ghostBtn(true), padding: "15px 32px", fontSize: 14.5 }}>Create account</button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ FOOTER */}
      <footer id="contact" style={{ background: LP.dark, color: LT.text, padding: `clamp(54px, 6vw, 84px) ${pad} 30px` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "clamp(28px, 5vw, 70px)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <InfraTrackLogo size={36} radius={9} bg={LT.amber} />
                <span style={{ fontSize: 20, fontWeight: 800 }}>InfraTrack</span>
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.66)", maxWidth: 340, lineHeight: 1.6 }}>Plan vs actual tracking for construction and infrastructure sites. Built by Shikhar Pratap Singh.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", color: LT.amber, marginBottom: 12 }}>Explore</div>
              {[["The Platform", "platform"], ["Expertise", "expertise"], ["Features", "features"], ["Sectors", "sectors"], ["FAQ", "faq"]].map(([l, id]) => (
                <button key={l} type="button" className="lp-footlink" onClick={() => go(id)}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, letterSpacing: 1.4, textTransform: "uppercase", color: LT.amber, marginBottom: 12 }}>Workspace</div>
              <button type="button" className="lp-footlink" onClick={() => openLogin()}>Login</button>
              <button type="button" className="lp-footlink" onClick={() => openLogin(null, "register")}>Create account</button>
              <button type="button" className="lp-footlink" onClick={() => go("roles")}>Roles</button>
            </div>
          </div>
          <div style={{ marginTop: 54, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>
            <span>© 2026 InfraTrack. All rights reserved.{updated ? ` Last updated ${updated}.` : ""}</span>
            <span style={{ display: "flex", gap: 18 }}><a href="/privacy" className="lp-footlink" style={{ textDecoration: "none", padding: 0 }}>Privacy</a><a href="/terms" className="lp-footlink" style={{ textDecoration: "none", padding: 0 }}>Terms of use</a></span>
            
          </div>
        </div>
      </footer>

      {searchOpen && <SearchOverlay items={searchItems} onClose={() => setSearchOpen(false)} onPick={(id) => { setSearchOpen(false); go(id); }} />}
      <ContactFab />

      {/* back to top */}
      <button type="button" className="no-print" aria-label="Back to top" onClick={() => go("top")} style={{
        position: "fixed", right: 22, bottom: 22, zIndex: 55, width: 46, height: 46, borderRadius: "50%", border: "none", cursor: "pointer",
        background: LT.amber, color: "#1B1204", display: "grid", placeItems: "center", boxShadow: "0 10px 26px rgba(0,0,0,0.3)",
        opacity: scrolled ? 1 : 0, pointerEvents: scrolled ? "auto" : "none", transform: scrolled ? "none" : "translateY(10px)", transition: "opacity 240ms, transform 240ms",
      }}>
        <LpUp size={20} />
      </button>
    </div>
  );
}

export default function LandingPageEntry({ onLogin = () => {}, updated = "" }: { onLogin?: (role?: string | null, mode?: string) => void; updated?: string }) {
  return <LandingPage onLogin={onLogin} updated={updated} />;
}
