// @ts-nocheck
"use client";
/* InfraTrack sign-in / sign-up screen (the supplied design) wired to the site's real Supabase accounts. */
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useBackdrop } from "./useBackdrop";
import { createBrowserClient } from "@supabase/ssr";
import {
  LayoutGrid, FolderKanban, Camera, GitMerge, Table2, AlertTriangle, Waypoints,
  MapPin, History, FileText, Users, Boxes, Sparkles, TrendingUp, Bell, Shield,
  Search, Sun, Moon, ChevronDown, ChevronRight, X, Check, Upload, Clock,
  CircleCheck, CircleAlert, CircleX, Filter, Download, Plus, ArrowUpRight, ArrowLeft,
  ArrowDownRight, Wrench, Truck, HardHat, Send, Bot, ChevronLeft, Building2,
  Radio, Link2, ShieldCheck, BadgeCheck, ClipboardList, Layers,
  Mic, Play, Pause, Waves, ScanLine, GitCompareArrows, CloudMoon, ArrowRight, LogOut, Copy,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, Navigation, RefreshCw,
  Video, Square, CircleDot, SwitchCamera, VideoOff, CalendarDays, Trash2, Pencil, Wallet, ListChecks, CloudSun, Eye, EyeOff
} from "lucide-react";

const FONT_UI = "'Manrope', 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace";

let sbClient = null;
function getSb() {
  if (!sbClient) sbClient = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
  return sbClient;
}
function friendlyAuthError(e) {
  const m = String((e && e.message) || "");
  if (/invalid login credentials/i.test(m)) return new Error("Wrong email or password.");
  if (/email not confirmed/i.test(m)) return new Error("Please confirm your email first: open the link we emailed you, then sign in.");
  if (/already registered|already been registered/i.test(m)) return new Error("An account with this email already exists. Sign in instead.");
  if (e && e.status === 429) return new Error("Too many attempts. Wait a minute and try again.");
  if (/password/i.test(m)) return new Error(m);
  return new Error("Could not complete that. Please try again.");
}
function userFromAuth(u) {
  const meta = (u && u.user_metadata) || {};
  const email = (u && u.email) || "";
  return { name: meta.full_name || meta.name || email.split("@")[0] || "User", email, id: u && u.id, role: LOGIN_ROLES.find(r => r.id === meta.role) || LOGIN_ROLES[1] };
}

function hexAlpha(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

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

const LT = {
  bg: "#0A0A0A",
  bgDeep: "#000000",
  panel: "#111111",
  panelBorder: "#2A2A2A",
  card: "rgba(10, 10, 10, 0.78)",
  cardBorder: "rgba(240, 169, 58, 0.16)",
  text: "#F5F5F5",
  textMuted: "#A3A3A3",
  textFaint: "#737373",
  amber: "#F0A93A",
  amberDim: "#8A6A2E",
  blue: "#A3A3A3",
  green: "#3FBE7C",
  line: "rgba(255, 255, 255, 0.12)",
};

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

function greeting(hour) {
  if (hour >= 5 && hour < 12) return { text: "Good morning", Icon: Sun };
  if (hour >= 12 && hour < 17) return { text: "Good afternoon", Icon: Sun };
  if (hour >= 17 && hour < 21) return { text: "Good evening", Icon: CloudMoon };
  return { text: "Good night", Icon: Moon };
}

function fmtTime(d) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}
function fmtDate(d) {
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long" });
}

const TELEMETRY_CHIPS = [
  "Plan vs actual", "Delay detection", "Cost & budget",
  "Safety log", "Forecast completion", "Contractor scorecard",
  "Resource analytics", "Daily progress report", "Audit trail",
];

const INFRA_SPOKES = [
  { angle: 0, len: 78, width: 15, tone: "amber", windows: 4 },
  { angle: 36, len: 58, width: 12, tone: "blue", windows: 3 },
  { angle: 72, len: 92, width: 13, tone: "blue", windows: 5, crane: true },
  { angle: 108, len: 50, width: 16, tone: "amber", windows: 2 },
  { angle: 144, len: 70, width: 11, tone: "blue", windows: 4 },
  { angle: 180, len: 62, width: 14, tone: "amber", windows: 3 },
  { angle: 216, len: 84, width: 12, tone: "blue", windows: 5 },
  { angle: 252, len: 46, width: 15, tone: "blue", windows: 2 },
  { angle: 288, len: 74, width: 13, tone: "amber", windows: 4 },
  { angle: 324, len: 56, width: 12, tone: "blue", windows: 3 },
];

function BottomInfraGlobe({ mx = 0, my = 0 }) {
  const SIZE = "min(94vw, 1150px)";
  const CX = 120, CY = 120, R_IN = 30, R_OUT_RING1 = 72, R_OUT_RING2 = 100;
  const toRad = (d) => (d * Math.PI) / 180;

  return (
    <div style={{
      position: "absolute", left: "50%", bottom: `calc(${SIZE} * -0.54)`,
      width: SIZE, height: SIZE, marginLeft: `calc(${SIZE} * -0.5)`,
      pointerEvents: "none", zIndex: 1,
      animation: "bsInfraFloat 10s ease-in-out infinite",
    }}>
      <style>{`
        @keyframes bsInfraFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes bsInfraSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bsInfraGlow { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: .85; transform: scale(1.03); } }
        @keyframes bsInfraRim { 0%, 100% { opacity: .45; } 50% { opacity: .85; } }
        @keyframes bsInfraBeacon { 0%, 100% { opacity: .55; r: 5; } 50% { opacity: 1; r: 7; } }
      `}</style>

      {/* soft atmospheric glow behind the disc */}
      <div style={{
        position: "absolute", inset: "-7%", borderRadius: "50%",
        background: `radial-gradient(circle, ${LT.amber}22 0%, ${LT.blue}14 45%, transparent 72%)`,
        filter: "blur(34px)", animation: "bsInfraGlow 7s ease-in-out infinite",
      }} />

      {/* slight 3D tilt that responds to cursor position */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden",
        transform: `perspective(1600px) rotateX(${9 + my * -4}deg) rotateY(${mx * 6}deg)`,
        transition: "transform 550ms ease-out",
        boxShadow: `0 0 0 1px ${LT.amberDim}66, 0 -50px 100px -20px ${LT.amber}22, inset 0 0 70px rgba(0,0,0,0.55)`,
        background: `radial-gradient(circle at 38% 32%, ${LT.panel} 0%, ${LT.bg} 60%, ${LT.bgDeep} 100%)`,
      }}>
        {/* continuously spinning rotor of infrastructure — seamless loop, radially symmetric so it reads fine at any angle */}
        <div style={{ position: "absolute", inset: "-10%", animation: "bsInfraSpin 80s linear infinite" }}>
          <svg viewBox="0 0 240 240" width="100%" height="100%">
            <defs>
              <pattern id="infraGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={LT.blue} strokeWidth="0.4" opacity="0.35" />
              </pattern>
            </defs>

            <rect x="0" y="0" width="240" height="240" fill="url(#infraGrid)" opacity="0.4" />

            {/* concentric tracked-progress rings */}
            <circle cx={CX} cy={CY} r={R_OUT_RING1} fill="none" stroke={LT.amberDim} strokeWidth="0.6" strokeDasharray="1.5 5" opacity="0.55" />
            <circle cx={CX} cy={CY} r={R_OUT_RING2} fill="none" stroke={LT.blue} strokeWidth="0.6" strokeDasharray="1.5 5" opacity="0.4" />

            {/* radiating buildings + one crane, arranged as a rotor so the spin always reads cleanly */}
            {INFRA_SPOKES.map((b, i) => {
              const rad = toRad(b.angle);
              const cos = Math.cos(rad), sin = Math.sin(rad);
              const x1 = CX + R_IN * cos, y1 = CY + R_IN * sin;
              const x2 = CX + (R_IN + b.len) * cos, y2 = CY + (R_IN + b.len) * sin;
              const strokeColor = b.tone === "amber" ? LT.amber : "#3a4a6b";
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={b.width} strokeLinecap="square" opacity={b.tone === "amber" ? 0.85 : 0.9} />
                  {Array.from({ length: b.windows }).map((_, w) => {
                    const t = 0.22 + w * (0.62 / Math.max(1, b.windows - 1 || 1));
                    const wx = x1 + (x2 - x1) * t, wy = y1 + (y2 - y1) * t;
                    return <circle key={w} cx={wx} cy={wy} r="1.4" fill={b.tone === "amber" ? "#1B1204" : LT.amber} opacity="0.8" />;
                  })}
                  {b.crane && (
                    <g stroke={LT.amber} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
                      <line x1={x2} y1={y2} x2={x2 - 22 * sin} y2={y2 + 22 * cos} />
                      <line x1={x2} y1={y2} x2={x2 + 10 * sin} y2={y2 - 10 * cos} />
                      <line x1={x2 - 22 * sin} y1={y2 + 22 * cos} x2={x2 - 22 * sin + 6 * cos} y2={y2 + 22 * cos + 6 * sin} />
                    </g>
                  )}
                </g>
              );
            })}

            {/* central hub / control tower */}
            <circle cx={CX} cy={CY} r="26" fill={LT.panel} stroke={LT.amberDim} strokeWidth="1" opacity="0.95" />
            <circle cx={CX} cy={CY} r="18" fill="none" stroke={LT.amber} strokeWidth="0.8" strokeDasharray="1 3" opacity="0.6" />
            <circle cx={CX} cy={CY} r="5" fill={LT.amber} style={{ animation: "bsInfraBeacon 2.2s ease-in-out infinite" }} />

            {/* progress markers travelling the tracked rings */}
            <circle r="2.2" fill={LT.amber}>
              <animateMotion dur="9s" repeatCount="indefinite" path={`M ${CX + R_OUT_RING1} ${CY} A ${R_OUT_RING1} ${R_OUT_RING1} 0 1 1 ${CX - R_OUT_RING1} ${CY} A ${R_OUT_RING1} ${R_OUT_RING1} 0 1 1 ${CX + R_OUT_RING1} ${CY}`} />
            </circle>
            <circle r="2" fill={LT.blue}>
              <animateMotion dur="13s" repeatCount="indefinite" path={`M ${CX - R_OUT_RING2} ${CY} A ${R_OUT_RING2} ${R_OUT_RING2} 0 1 0 ${CX + R_OUT_RING2} ${CY} A ${R_OUT_RING2} ${R_OUT_RING2} 0 1 0 ${CX - R_OUT_RING2} ${CY}`} />
            </circle>
          </svg>
        </div>

        {/* sphere shading so it reads as a lit dome, not a flat spinning graphic */}
        <div style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(circle at 36% 28%, transparent 32%, rgba(4,6,11,0.62) 100%)`,
        }} />
        <div style={{
          position: "absolute", inset: 0,
          boxShadow: "inset -34px -26px 90px rgba(0,0,0,0.68), inset 16px 16px 44px rgba(255,255,255,0.06)",
        }} />
      </div>

      {/* amber rim light along the visible top arc, ties it into the InfraTrack accent color */}
      <div style={{
        position: "absolute", top: "0%", left: "50%", width: "78%", height: "5%", marginLeft: "-39%",
        borderRadius: "50%", background: `linear-gradient(180deg, ${LT.amber}70, transparent)`,
        filter: "blur(12px)", animation: "bsInfraRim 6s ease-in-out infinite",
      }} />
    </div>
  );
}

const LOGIN_VIDEOS = [
  { src: "/landing/city.mp4", poster: "/landing/city.jpg" },
  { src: "/landing/bridge.mp4", poster: "/landing/bridge.jpg" },
  { src: "/landing/aerial.mp4", poster: "/landing/aerial.jpg" },
];

function LoginMotionBackground({ mx = 0, my = 0 }) {
  const [clip, setClip] = useState(0);
  useEffect(() => { const t = setInterval(() => setClip(c => (c + 1) % LOGIN_VIDEOS.length), 6000); return () => clearInterval(t); }, []);
  const particles = useMemo(() => (
    Array.from({ length: 16 }).map((_, i) => ({
      id: i,
      left: Math.round((i * 37 + 13) % 100),
      size: 1 + ((i * 7) % 3),
      duration: 14 + ((i * 11) % 16),
      delay: -(i * 3) % 20,
      opacity: 0.12 + ((i % 5) * 0.04),
    }))
  ), []);

  const chips = useMemo(() => (
    TELEMETRY_CHIPS.map((t, i) => ({
      id: i,
      text: t,
      left: Math.round((i * 53 + 9) % 88) + 4,
      duration: 13 + ((i * 5) % 9),
      delay: -(i * 4.2) % 22,
    }))
  ), []);

  const ROUTES = [
    { id: "r1", d: "M -50 700 C 250 640, 480 730, 780 630 S 1180 560, 1458 520", color: LT.amber, dur: 6.5, delay: "0s", dash: 15, width: 3.2 },
    { id: "r2", d: "M -50 420 C 300 340, 560 480, 900 400 S 1300 300, 1458 340", color: LT.blue, dur: 8, delay: "-2.6s", dash: 12, width: 2.6 },
    { id: "r3", d: "M 700 300 C 950 250, 1150 330, 1408 260", color: LT.green, dur: 5.4, delay: "-1.2s", dash: 20, width: 2.2 },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: LT.bgDeep }}>
      <style>{`
        @keyframes bsKenBurns {
          0% { transform: scale(1) translate3d(0,0,0); }
          50% { transform: scale(1.09) translate3d(-1.4%,-0.8%,0); }
          100% { transform: scale(1.04) translate3d(1%,1.4%,0); }
        }
        @keyframes bsRise { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: .4; } 100% { transform: translateY(-90vh); opacity: 0; } }
        @keyframes bsChipDrift {
          0% { transform: translateY(0); opacity: 0; }
          8% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(-70vh); opacity: 0; }
        }
        @keyframes bsCometFlow { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -100; } }
        @keyframes bsScan { 0% { transform: translateY(-20%); opacity: 0; } 10% { opacity: .45; } 90% { opacity: .45; } 100% { transform: translateY(120%); opacity: 0; } }
      `}</style>

      {/* real video backdrop: three short clips that cross-fade one after another */}
      {LOGIN_VIDEOS.map((v, k) => (
        <video key={v.src} src={v.src} poster={v.poster} autoPlay muted loop playsInline preload={k === 0 ? "auto" : "metadata"} aria-hidden="true" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block",
          opacity: k === clip ? 1 : 0, transition: "opacity 1400ms ease-in-out",
          transform: `scale(1.04) translate3d(${mx * -10}px, ${my * -10}px, 0)`,
          filter: "brightness(0.6) saturate(1.15) contrast(1.05)",
        }} />
      ))}

      {/* legibility gradients over the photo */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(90deg, #000000b0 0%, #00000040 42%, transparent 62%, #00000055 100%)`,
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, #00000080 0%, transparent 20%, transparent 68%, #00000090 100%)`,
      }} />

      <div style={{
        position: "absolute", left: 0, right: 0, height: "36%",
        background: `linear-gradient(180deg, transparent, ${LT.amber}0a 40%, ${LT.amber}16 50%, ${LT.amber}0a 60%, transparent)`,
        animation: "bsScan 10s ease-in-out infinite",
      }} />

      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", bottom: 0, left: `${p.left}%`, width: p.size, height: p.size,
          borderRadius: "50%", background: LT.amber, opacity: p.opacity,
          animation: `bsRise ${p.duration}s linear infinite`, animationDelay: `${p.delay}s`,
          boxShadow: `0 0 6px ${LT.amber}`,
        }} />
      ))}

      {chips.map(c => (
        <div key={c.id} style={{
          position: "absolute", bottom: "-4%", left: `${c.left}%`, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999,
          border: `1px solid ${LT.panelBorder}`, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          fontFamily: FONT_MONO, fontSize: 10, color: LT.textFaint,
          animation: `bsChipDrift ${c.duration}s linear infinite`, animationDelay: `${c.delay}s`,
        }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: LT.amber, flexShrink: 0 }} />
          {c.text}
        </div>
      ))}

      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 92% 85% at 50% 45%, transparent 58%, #00000070 100%)` }} />
    </div>
  );
}

/** Password field with a show / hide button. */
function PwInput({ style, ...rest }: any) {
  const [show, setShow] = useState(false);
  const { marginBottom, marginTop, ...inner } = style || {};
  return (
    <div style={{ position: "relative", marginBottom, marginTop }}>
      <input {...rest} type={show ? "text" : "password"} style={{ ...inner, paddingRight: 40 }} />
      <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} tabIndex={0}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: LT.textMuted, display: "grid", placeItems: "center", padding: 4 }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function LoginCard({ onSubmit, onSwitchToRegister, notice }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const missingFields = touched && (!email.trim() || !pass);

  const handleSubmit = async () => {
    setTouched(true); setError("");
    if (!email.trim() || !pass) return;
    setSubmitting(true);
    try { await onSubmit({ email: email.trim(), password: pass }); }
    catch (e) { setError(e && e.message ? e.message : "Couldn't sign in."); setSubmitting(false); }
  };
  const handleCardMove = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    setTilt({ x: (e.clientX - rect.left) / rect.width - 0.5, y: (e.clientY - rect.top) / rect.height - 0.5 });
  };
  const resetTilt = () => setTilt({ x: 0, y: 0 });
  const fieldStyle = (bad) => ({
    width: "100%", marginTop: 6, marginBottom: 16, padding: "11px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)",
    border: `1px solid ${bad ? "#E0685B" : LT.panelBorder}`, color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
  });
  return (
    <div ref={cardRef} onMouseMove={handleCardMove} onMouseLeave={resetTilt} style={{
      width: 420, maxWidth: "92vw", background: LT.card, border: `1px solid ${LT.cardBorder}`,
      borderRadius: 16, padding: "34px 32px", backdropFilter: "blur(18px)",
      boxShadow: `0 30px 80px rgba(0,0,0,0.5), ${-tilt.x * 26}px ${-tilt.y * 26}px 50px rgba(240,169,58,${0.05 + Math.abs(tilt.x + tilt.y) * 0.05})`,
      animation: "bsCardIn 700ms cubic-bezier(.16,1,.3,1)",
      transform: `perspective(900px) rotateX(${tilt.y * -6}deg) rotateY(${tilt.x * 6}deg)`,
      transition: "transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease", transformStyle: "preserve-3d",
    }}>
      <style>{`
        @keyframes bsCardIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .bs-field { box-sizing: border-box; }
        .bs-field:focus { border-color: ${LT.amber} !important; box-shadow: 0 0 0 3px rgba(240,169,58,0.16); }
        .bs-submit { transition: filter 140ms ease, transform 140ms ease; }
        .bs-submit:hover { filter: brightness(1.08); }
        .bs-submit:active { transform: translateY(1px); }
        @keyframes bsSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <InfraTrackLogo size={30} bg={LT.amber} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>InfraTrack</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "18px 0 4px", color: LT.text }}>Sign in to your workspace</h1>
      <p style={{ fontSize: 13.5, color: LT.textMuted, margin: "0 0 22px" }}>Your projects are saved to your account and visible only to you.</p>
      {notice && notice.text && (
        <div role="status" style={{ margin: "-6px 0 18px", padding: "9px 11px", borderRadius: 9, fontSize: 12.5, lineHeight: 1.45,
          color: notice.kind === "err" ? "#E0685B" : LT.green, border: `1px solid ${notice.kind === "err" ? "#E0685B55" : "#3FBE7C55"}`, background: notice.kind === "err" ? "rgba(224,104,91,0.08)" : "rgba(63,190,124,0.08)" }}>
          {notice.text}
        </div>)}

      <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Email</label>
      <input className="bs-field" type="email" value={email} autoFocus autoComplete="email" onChange={e => { setEmail(e.target.value); setError(""); }}
        placeholder="you@company.com" style={fieldStyle(touched && !email.trim())} />

      <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Password</label>
      <PwInput className="bs-field" value={pass} autoComplete="current-password" onChange={e => { setPass(e.target.value); setError(""); }}
        onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }} placeholder="••••••••"
        style={{ ...fieldStyle(touched && !pass), marginBottom: missingFields || error ? 8 : 22 }} />
      {missingFields && (
        <p style={{ fontSize: 11.5, color: "#E0685B", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 5 }}>
          <AlertTriangle size={12} /> Enter your email and password.
        </p>)}
      {error && <p style={{ fontSize: 12, color: "#E0685B", margin: "0 0 14px", lineHeight: 1.45 }}>{error}</p>}

      <button type="button" onClick={handleSubmit} disabled={submitting} className="bs-submit" style={{
        width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: submitting ? "default" : "pointer",
        background: LT.amber, color: "#1B1204", fontSize: 14, fontWeight: 700, opacity: submitting ? 0.85 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {submitting ? (
          <>
            <span style={{ width: 14, height: 14, border: "2px solid #1B120455", borderTopColor: "#1B1204", borderRadius: "50%", animation: "bsSpin 700ms linear infinite", display: "inline-block" }} />
            Signing in
          </>
        ) : (<>Sign in <ChevronRight size={15} /></>)}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 18 }}>
        <Shield size={12} color={LT.textFaint} />
        <span style={{ fontSize: 11, color: LT.textFaint }}>Each account can only read and change its own data.</span>
      </div>
      <div style={{ textAlign: "center", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${LT.panelBorder}` }}>
        <span style={{ fontSize: 12.5, color: LT.textFaint }}>First time here? </span>
        <button type="button" onClick={onSwitchToRegister} style={{ background: "none", border: "none", cursor: "pointer", color: LT.amber, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
          Create an account
        </button>
        <div style={{ marginTop: 12 }}>
          <a href="/forgot-password" style={{ color: LT.textFaint, fontSize: 12, textDecoration: "underline" }}>Forgot your password?</a>
        </div>
      </div>
    </div>
  );
}

function RegisterCard({ onSubmit, onSwitchToLogin }) {
  const [roleId, setRoleId] = useState("pm");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const role = LOGIN_ROLES.find(r => r.id === roleId);
  const passMismatch = touched && confirmPass.length > 0 && pass !== confirmPass;
  const canSubmit = name.trim() && email.trim() && pass && pass === confirmPass;

  const handleSubmit = async () => {
    setTouched(true); setError(""); setInfo("");
    if (!canSubmit) return;
    if (pass.length < 10) { setError("Use a password with at least 10 characters."); return; }
    setSubmitting(true);
    try { await onSubmit({ name: name.trim(), role, email: email.trim(), org: org.trim(), password: pass }); }
    catch (e) { if (e && e.info) setInfo(e.message); else setError(e && e.message ? e.message : "Couldn't create the account."); setSubmitting(false); }
  };

  const handleCardMove = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: px, y: py });
  };
  const resetTilt = () => setTilt({ x: 0, y: 0 });

  return (
    <div ref={cardRef} onMouseMove={handleCardMove} onMouseLeave={resetTilt} style={{
      width: 420, maxWidth: "92vw", background: LT.card, border: `1px solid ${LT.cardBorder}`,
      borderRadius: 16, padding: "34px 32px", backdropFilter: "blur(18px)",
      boxShadow: `0 30px 80px rgba(0,0,0,0.5), ${-tilt.x * 26}px ${-tilt.y * 26}px 50px rgba(240,169,58,${0.05 + Math.abs(tilt.x + tilt.y) * 0.05})`,
      animation: "bsCardIn 700ms cubic-bezier(.16,1,.3,1)",
      transform: `perspective(900px) rotateX(${tilt.y * -6}deg) rotateY(${tilt.x * 6}deg)`,
      transition: "transform 260ms cubic-bezier(.16,1,.3,1), box-shadow 260ms ease",
      transformStyle: "preserve-3d",
      maxHeight: "88vh", overflowY: "auto",
    }}>
      <style>{`
        @keyframes bsCardIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .bs-role-pill { transition: border-color 140ms ease, background 140ms ease, transform 140ms ease; }
        .bs-role-pill:hover { transform: translateY(-1px) scale(1.02); }
        .bs-field { box-sizing: border-box; }
        .bs-field:focus { border-color: ${LT.amber} !important; box-shadow: 0 0 0 3px rgba(240,169,58,0.16); }
        .bs-submit { transition: filter 140ms ease, transform 140ms ease; }
        .bs-submit:hover { filter: brightness(1.08); }
        .bs-submit:active { transform: translateY(1px); }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <InfraTrackLogo size={30} bg={LT.amber} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>InfraTrack</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "18px 0 4px", color: LT.text }}>Create your workspace account</h1>
      <p style={{ fontSize: 13.5, color: LT.textMuted, margin: "0 0 22px" }}>Set up your profile once — your role decides what you see.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {LOGIN_ROLES.map(r => {
          const active = r.id === roleId;
          const Icon = r.icon;
          return (
            <button
              type="button" key={r.id} onClick={() => setRoleId(r.id)}
              className="bs-role-pill"
              style={{
                display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                padding: "10px 10px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${active ? LT.amber : LT.panelBorder}`,
                background: active ? "rgba(240,169,58,0.10)" : "rgba(255,255,255,0.02)",
              }}
            >
              <Icon size={15} color={active ? LT.amber : LT.textMuted} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? LT.text : LT.textMuted }}>{r.label}</span>
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: LT.textFaint, margin: "-12px 0 18px", fontFamily: FONT_MONO }}>{role.blurb}</p>

      <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Full name</label>
      <input
        className="bs-field" value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Aarav Mehta" autoFocus
        style={{
          width: "100%", marginTop: 6, marginBottom: 14,
          padding: "11px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)",
          border: `1px solid ${touched && !name.trim() ? "#E0685B" : LT.panelBorder}`,
          color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
        }}
      />

      <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Work email</label>
      <input
        className="bs-field" type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="you@company.com"
        style={{
          width: "100%", marginTop: 6, marginBottom: 14,
          padding: "11px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)",
          border: `1px solid ${touched && !email.trim() ? "#E0685B" : LT.panelBorder}`,
          color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
        }}
      />

      <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Organization <span style={{ color: LT.textFaint, fontWeight: 500 }}>(optional)</span></label>
      <input
        className="bs-field" value={org} onChange={e => setOrg(e.target.value)}
        placeholder="e.g. NHAI, L&T, ABC Infra"
        style={{
          width: "100%", marginTop: 6, marginBottom: 14, padding: "11px 12px", borderRadius: 9,
          background: "rgba(255,255,255,0.03)", border: `1px solid ${LT.panelBorder}`,
          color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: passMismatch ? 4 : 22 }}>
        <div>
          <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Password</label>
          <PwInput
            className="bs-field" value={pass} onChange={e => setPass(e.target.value)}
            placeholder="••••••••"
            style={{
              width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9,
              background: "rgba(255,255,255,0.03)", border: `1px solid ${LT.panelBorder}`,
              color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: LT.textMuted, fontWeight: 600 }}>Confirm</label>
          <PwInput
            className="bs-field" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="••••••••"
            style={{
              width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9,
              background: "rgba(255,255,255,0.03)", border: `1px solid ${passMismatch ? "#E0685B" : LT.panelBorder}`,
              color: LT.text, fontSize: 14, outline: "none", fontFamily: FONT_UI,
            }}
          />
        </div>
      </div>
      {passMismatch && (
        <p style={{ fontSize: 11.5, color: "#E0685B", margin: "0 0 16px" }}>Passwords don't match.</p>
      )}
      {error && <p style={{ fontSize: 12, color: "#E0685B", margin: "0 0 14px", lineHeight: 1.45 }}>{error}</p>}
      {info && <p style={{ fontSize: 12, color: "#6CCB8B", margin: "0 0 14px", lineHeight: 1.45 }}>{info}</p>}

      <button type="button" onClick={handleSubmit} disabled={submitting} className="bs-submit" style={{
        width: "100%", padding: "12px 0", borderRadius: 10, border: "none", cursor: submitting ? "default" : "pointer",
        background: LT.amber, color: "#1B1204", fontSize: 14, fontWeight: 700, opacity: submitting ? 0.85 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {submitting ? (
          <>
            <span style={{
              width: 14, height: 14, border: "2px solid #1B120455", borderTopColor: "#1B1204",
              borderRadius: "50%", animation: "bsSpin 700ms linear infinite", display: "inline-block",
            }} />
            Creating account
          </>
        ) : (
          <>Create account & continue <ChevronRight size={15} /></>
        )}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 18 }}>
        <Shield size={12} color={LT.textFaint} />
        <span style={{ fontSize: 11, color: LT.textFaint }}>Your details stay scoped to your organization's workspace.</span>
      </div>

      <div style={{ textAlign: "center", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${LT.panelBorder}` }}>
        <span style={{ fontSize: 12.5, color: LT.textFaint }}>Already have an account? </span>
        <button type="button" onClick={onSwitchToLogin} style={{
          background: "none", border: "none", cursor: "pointer", color: LT.amber, fontSize: 12.5, fontWeight: 700, padding: 0,
        }}>
          Sign in
        </button>
      </div>
    </div>
  );
}

function WelcomeScreen({ user, onEnter, onSwitch }) {
  const now = useClock();
  const { text, Icon } = greeting(now.getHours());

  return (
    <div style={{
      position: "relative", zIndex: 2, minHeight: "100vh", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24,
    }}>
      <style>{`@keyframes bsWelcomeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999,
        border: `1px solid ${LT.cardBorder}`, background: "rgba(240,169,58,0.08)", marginBottom: 26,
        animation: "bsWelcomeIn 500ms ease both",
      }}>
        <Icon size={14} color={LT.amber} />
        <span style={{ fontSize: 12, color: LT.amber, fontFamily: FONT_MONO, letterSpacing: 0.3 }}>{fmtTime(now)} · {fmtDate(now)}</span>
      </div>

      <h1 style={{
        fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 700, color: LT.text, margin: "0 0 10px",
        animation: "bsWelcomeIn 600ms ease 80ms both",
      }}>
        {text}, {user.name.split(" ")[0]}
      </h1>
      <p style={{ fontSize: 15, color: LT.textMuted, margin: "0 0 34px", animation: "bsWelcomeIn 600ms ease 160ms both" }}>
        Signed in as <span style={{ color: LT.text, fontWeight: 600 }}>{user.role.label}</span> — your workspace is ready.
      </p>

      <button onClick={onEnter} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 10,
        border: "none", cursor: "pointer", background: LT.amber, color: "#1B1204", fontWeight: 700, fontSize: 14,
        animation: "bsWelcomeIn 600ms ease 240ms both",
      }}>
        Enter workspace <ArrowRight size={15} />
      </button>

      <button onClick={onSwitch} style={{
        marginTop: 14, background: "none", border: "none", color: LT.textFaint, fontSize: 12.5, cursor: "pointer",
        animation: "bsWelcomeIn 600ms ease 300ms both",
      }}>
        Not you? Sign in again
      </button>
    </div>
  );
}

function LogoIntro({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: LT.bgDeep, display: "grid", placeItems: "center",
      zIndex: 50, animation: "bsIntroFadeOut 350ms ease 1150ms forwards",
    }}>
      <style>{`
        @keyframes bsLogoFlipIn {
          0% { transform: perspective(900px) rotateY(0deg) scale(0.6); opacity: 0; }
          35% { opacity: 1; }
          100% { transform: perspective(900px) rotateY(360deg) scale(1); opacity: 1; }
        }
        @keyframes bsIntroFadeOut { to { opacity: 0; visibility: hidden; } }
        @keyframes bsIntroGlow { 0%, 100% { opacity: .4; transform: scale(1); } 50% { opacity: .8; transform: scale(1.08); } }
        @keyframes bsIntroTextIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%", width: 160, height: 160,
          transform: "translate(-50%, -60%)", borderRadius: "50%",
          background: `radial-gradient(circle, ${LT.amber}35 0%, transparent 70%)`,
          filter: "blur(22px)", animation: "bsIntroGlow 1.5s ease-in-out infinite",
        }} />
        <div style={{ animation: "bsLogoFlipIn 900ms cubic-bezier(.22,.85,.28,1) both", transformStyle: "preserve-3d" }}>
          <InfraTrackLogo size={76} radius={20} bg={LT.amber} />
        </div>
        <div style={{
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 21, color: LT.text, letterSpacing: 0.3,
          opacity: 0, animation: "bsIntroTextIn 450ms ease 750ms forwards",
        }}>
          InfraTrack
        </div>
      </div>
    </div>
  );
}

export default function LoginStage({ next = "/workspace", startMode = "login", notice = null }: { next?: string; startMode?: string; notice?: { kind: string; text: string } | null }) {
  useBackdrop(LT.bgDeep);
  const [user, setUser] = useState(null);
  const [introUser, setIntroUser] = useState(null);
  const [mode, setMode] = useState(startMode === "register" ? "register" : "login"); // "login" | "register"
  const now = useClock();
  const { x: mx, y: my } = useMouseParallax();
  const handleIntroDone = useCallback(() => setUser(introUser), [introUser]);
  // Real sign-in: the same Supabase account system as the rest of the site. The session is stored in cookies,
  // so the server pages see the user as soon as we navigate.
  const doLogin = async ({ email, password }) => {
    const { data, error } = await getSb().auth.signInWithPassword({ email, password });
    if (error) throw friendlyAuthError(error);
    setIntroUser(userFromAuth(data.user));
  };
  const doRegister = async ({ name, role, email, org, password }) => {
    const { data, error } = await getSb().auth.signUp({
      email, password,
      options: { data: { full_name: name, name, role: role.id, org }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/workspace` },
    });
    if (error) throw friendlyAuthError(error);
    if (data.session && data.user) { setIntroUser(userFromAuth(data.user)); return; }
    const info = new Error("Account created. Check your email and confirm it, then sign in.");
    info.info = true;
    throw info;
  };
  const enter = () => { window.location.assign(next); };
  const signInAgain = async () => {
    try { await getSb().auth.signOut(); } catch (e) { /* best effort */ }
    setUser(null); setIntroUser(null); setMode("login");
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: LT.bg, color: LT.text, fontFamily: FONT_UI, overflow: "hidden" }}>
      <LoginMotionBackground mx={mx} my={my} />

      {!user && !introUser && (
        <div style={{ position: "absolute", top: 24, left: 28, zIndex: 2, display: "flex", alignItems: "center", gap: 10 }}>
          <InfraTrackLogo size={30} bg={LT.amber} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>InfraTrack</span>
        </div>
      )}
      {!user && !introUser && (
        <div style={{
          position: "absolute", bottom: 22, left: 28, zIndex: 2, display: "flex", alignItems: "center", gap: 14,
          fontFamily: FONT_MONO, fontSize: 11.5, color: LT.textFaint,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Radio size={12} color={LT.amber} /> Plan vs actual tracking
          </span>
          <span>{fmtTime(now)}</span>
        </div>
      )}

      {introUser && !user && (
        <LogoIntro onDone={handleIntroDone} />
      )}

      {!user && !introUser ? (
        <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 1100, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 60, padding: "0 40px" }}>
            <div style={{
              flex: 1, display: typeof window !== "undefined" && window.innerWidth < 900 ? "none" : "block",
              transform: `translate3d(${mx * -10}px, ${my * -10}px, 0)`, transition: "transform 400ms ease-out",
            }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: LT.amber, letterSpacing: 0.5, margin: "0 0 14px" }}>
                Execution intelligence, on site
              </p>
              <h2 style={{ fontSize: "clamp(30px, 3.6vw, 44px)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px", maxWidth: 480 }}>
                Every excavation, pour and delay — tracked before the report lands.
              </h2>
              <p style={{ fontSize: 14.5, color: LT.textMuted, maxWidth: 420, lineHeight: 1.6 }}>
                One workspace for admins, project managers, site engineers and contractors to see the same schedule, in real time.
              </p>
              <div style={{ display: "flex", gap: 22, marginTop: 30 }}>
                {[["Plan vs Actual", "Daily · weekly · monthly"], ["Delay alerts", "Schedule, cost & safety"], ["Private cloud", "Only you see your data"]].map(([n, l]) => (
                  <div key={l}>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT_MONO, color: LT.text }}>{n}</div>
                    <div style={{ fontSize: 11.5, color: LT.textFaint, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {mode === "login" ? (
              <LoginCard onSubmit={doLogin} onSwitchToRegister={() => setMode("register")} notice={notice} />
            ) : (
              <RegisterCard onSubmit={doRegister} onSwitchToLogin={() => setMode("login")} />
            )}
          </div>
        </div>
      ) : user ? (
        <WelcomeScreen user={user} onEnter={enter} onSwitch={signInAgain} />
      ) : null}
    </div>
  );
}

