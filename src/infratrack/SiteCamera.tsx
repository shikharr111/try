// @ts-nocheck
"use client";
/**
 * SiteCamera.jsx  -  InfraTrack Site Activity Monitor
 * ---------------------------------------------------------------------------
 * Laptop shows the dashboard + QR code. Phone scans the QR, opens the same
 * website in "camera mode" and streams its camera to the laptop (WebRTC).
 * The laptop detects people in the video (TensorFlow.js COCO-SSD) and shows
 * how many are on camera, how many are moving and how many are idle.
 *
 * Self-contained: one file, no npm installs. PeerJS, TensorFlow.js, COCO-SSD
 * are loaded from the jsDelivr CDN when first needed.
 *
 * HOW IT IS WIRED INTO INFRATRACK
 * - Laptop: sidebar "Site Activity" renders <SiteCamera theme={theme} /> (the monitor + QR code).
 * - Phone: the QR code opens /camera?cam=<id> (public page, no login) which renders the same component
 *   and streams the camera. The link always points at /camera, whatever page the laptop is on.
 * - The phone camera needs HTTPS (the deployed site is). Both devices need internet: the connection is set up
 *   through the free public PeerJS server, then the video goes directly phone -> laptop.
 * - PeerJS, TensorFlow.js and COCO-SSD load from the jsDelivr CDN the first time it is used.
 */
import { drawQr } from "@/lib/qr/qr";
import { createClient } from "@supabase/supabase-js";
import { toGray, boxMotion, backgroundMotion, motionThreshold } from "@/lib/sitecam/motion";
import React, { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ config */

const LIBS = {
  peer: "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
  tf: "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
  coco: "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js",
};

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

/**
 * Peer options with a free public TURN relay (Open Relay "static auth"): time-limited credentials are
 * derived from the project's public shared secret (HMAC-SHA1), so no account or API key is needed.
 * If anything fails we fall back to STUN only.
 */
async function buildPeerOpts() {
  const iceServers = STUN_SERVERS.slice();
  try {
    const username = String(Math.floor(Date.now() / 1000) + 24 * 3600);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode("openrelayprojectsecret"), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(username)));
    let bin = "";
    sig.forEach((x) => (bin += String.fromCharCode(x)));
    const credential = btoa(bin);
    iceServers.push(
      { urls: "turn:staticauth.openrelay.metered.ca:80", username, credential },
      { urls: "turn:staticauth.openrelay.metered.ca:443", username, credential },
      { urls: "turns:staticauth.openrelay.metered.ca:443?transport=tcp", username, credential }
    );
  } catch {
    /* STUN only */
  }
  return { debug: 1, config: { iceServers } };
}

const ZERO = { total: 0, moving: 0, idle: 0 };
const WINDOW_MS = 1400; // motion is measured over this much history
const MIN_SPAN_MS = 700; // need at least this much history before judging motion
const MAX_MISSED = 6; // frames a person may vanish before the track is dropped

/* ----------------------------------------------------------------- helpers */

const scriptCache = {};
function loadScript(src) {
  if (!scriptCache[src]) {
    scriptCache[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        delete scriptCache[src];
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(s);
    });
  }
  return scriptCache[src];
}

export function isCameraLink() {
  try {
    return !!new URLSearchParams(window.location.search).get("cam");
  } catch {
    return false;
  }
}

const pad = (n) => String(n).padStart(2, "0");
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------------------------------------------------------- backup path
 * When a direct phone-to-laptop WebRTC link cannot be made (strict Wi-Fi, mobile data, etc.), the phone sends small
 * JPEG frames (~4 per second) through a Supabase Realtime broadcast channel instead. The channel name contains a random
 * secret from the QR link; nothing is stored. The laptop turns the frames back into a video stream for the counter. */
const RELAY_FPS = 4;
function relayChannel(hostId, key, onEvent) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anon || !key) return null;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
  const ch = client.channel("sa-" + hostId + "-" + key, { config: { broadcast: { self: false } } });
  ["frame", "relay-start", "need-relay", "bye"].forEach((ev) => ch.on("broadcast", { event: ev }, (m) => onEvent(ev, m.payload || {})));
  ch.subscribe();
  return {
    send: (event, payload) => ch.send({ type: "broadcast", event, payload: payload || {} }),
    close: () => {
      try {
        client.removeChannel(ch);
      } catch {}
    },
  };
}
function newKey() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

function buildLink(base, id, key) {
  try {
    let b = base.trim();
    if (!/^https?:\/\//i.test(b)) b = "https://" + b;
    const u = new URL(b);
    u.pathname = "/camera";
    u.search = "?cam=" + encodeURIComponent(id) + (key ? "&k=" + encodeURIComponent(key) : "");
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function linkWarning(base) {
  try {
    let b = base.trim();
    if (!/^https?:\/\//i.test(b)) b = "https://" + b;
    const u = new URL(b);
    if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
      return "A phone cannot open localhost. Type this laptop's IP address (like https://192.168.1.5:5173) or a deployed / tunnel URL below.";
    if (u.protocol === "http:")
      return "The phone camera only works on HTTPS. Use an https:// address.";
    return "";
  } catch {
    return "That address is not valid yet.";
  }
}

function describeMediaError(e) {
  switch (e && e.name) {
    case "Insecure":
      return "The camera needs a secure (https) page. Ask for the https link and scan the QR code again.";
    case "NotAllowedError":
      return "Camera permission is blocked. Allow the camera for this site in the browser settings, then tap Start camera.";
    case "NotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Another app is using the camera. Close it and tap Start camera again.";
    case "OverconstrainedError":
      return "This camera does not support the requested settings.";
    default:
      return (e && e.message) || "Could not start the camera.";
  }
}

const thrFromSens = (s) => 0.4 - s * 0.34; // sensitivity 0..1 -> speed threshold (person-heights / second)

/* ----------------------------------------------------------- people tracker */

function updateTracks(tracks, dets, now, thr, idRef) {
  const pairs = [];
  tracks.forEach((t, ti) =>
    dets.forEach((d, di) => {
      const dist = Math.hypot(t.cx - d.cx, t.cy - d.cy);
      if (dist < Math.max(t.h, d.h) * 0.9) pairs.push([dist, ti, di]);
    })
  );
  pairs.sort((a, b) => a[0] - b[0]);

  const usedT = new Set();
  const usedD = new Set();
  for (const [, ti, di] of pairs) {
    if (usedT.has(ti) || usedD.has(di)) continue;
    usedT.add(ti);
    usedD.add(di);
    const t = tracks[ti];
    const d = dets[di];
    Object.assign(t, { cx: d.cx, cy: d.cy, w: d.w, h: d.h, x: d.x, y: d.y, missed: 0 });
    t.hits += 1;
    t.trail.push({ t: now, cx: d.cx, cy: d.cy, h: d.h });
    while (t.trail.length > 2 && now - t.trail[0].t > WINDOW_MS) t.trail.shift();

    const a = t.trail[0];
    const b = t.trail[t.trail.length - 1];
    const span = b.t - a.t;
    if (span >= MIN_SPAN_MS) {
      const hAvg = t.trail.reduce((s, p) => s + p.h, 0) / t.trail.length || 1;
      const speed = Math.hypot(b.cx - a.cx, b.cy - a.cy) / hAvg / (span / 1000);
      t.fast = t.fast ? speed >= thr * 0.7 : speed >= thr; // hysteresis stops flicker
      t.moving = t.fast || !!t.byDiff;
    }
  }
  tracks.forEach((t, ti) => {
    if (!usedT.has(ti)) t.missed += 1;
  });
  dets.forEach((d, di) => {
    if (usedD.has(di)) return;
    tracks.push({
      id: idRef.current++,
      ...d,
      hits: 1,
      missed: 0,
      moving: false,
      trail: [{ t: now, cx: d.cx, cy: d.cy, h: d.h }],
    });
  });
  return tracks.filter((t) => t.missed <= MAX_MISSED);
}

function drawBoxes(canvas, video, vis) {
  const W = video.videoWidth;
  const H = video.videoHeight;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const lw = Math.max(2, W / 320);
  const fs = Math.max(13, Math.round(W / 46));
  ctx.lineWidth = lw;
  ctx.font = `600 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.textBaseline = "middle";
  vis.forEach((t) => {
    const col = t.moving ? "#F26A1B" : "#5FB0FF";
    ctx.strokeStyle = col;
    ctx.strokeRect(t.x, t.y, t.w, t.h);
    const label = `Person ${t.id} ${t.moving ? "moving" : "idle"}`;
    const tw = ctx.measureText(label).width + 10;
    const th = fs + 6;
    const ly = t.y - th >= 0 ? t.y - th : t.y;
    ctx.fillStyle = col;
    ctx.fillRect(t.x, ly, tw, th);
    ctx.fillStyle = "#0E151B";
    ctx.fillText(label, t.x + 5, ly + th / 2 + 1);
  });
}

/* ------------------------------------------------------------------ styles */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap');
.sc-root{--sc-ink:#17222D;--sc-steel:#5E6F7E;--sc-line:#C9D0D6;--sc-panel:#F7F8F9;--sc-bg:#E9ECEE;--sc-move:#F26A1B;--sc-idle:#2F6FA8;--sc-stage:#0E151B;--sc-field:#fff;--sc-btn-ink:#fff;--sc-barbg:#D6DBE0;
  font-family:Barlow,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--sc-ink);background:var(--sc-bg);padding:20px;border-radius:14px;box-sizing:border-box;line-height:1.4}
.sc-root *,.sc-root *::before,.sc-root *::after{box-sizing:border-box}
.sc-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 20px;margin-bottom:16px}
.sc-title{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:32px;line-height:1;margin:0;letter-spacing:.005em}
.sc-sub{margin:6px 0 0;color:var(--sc-steel);font-size:15px;max-width:60ch}
.sc-chips{display:flex;flex-wrap:wrap;gap:8px}
.sc-chip{display:inline-flex;align-items:center;gap:7px;background:var(--sc-panel);border:1px solid var(--sc-line);border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:500}
.sc-dot{width:9px;height:9px;border-radius:50%;background:#9AA7B2;flex:none}
.sc-dot.live{background:#D93025;animation:sc-pulse 1.6s ease-in-out infinite}
.sc-dot.ok{background:#1E9E5A}
.sc-dot.wait{background:#E0A100}
@keyframes sc-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.sc-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:16px;align-items:start}
@media (max-width:920px){.sc-grid{grid-template-columns:minmax(0,1fr)}}
.sc-stage{position:relative;background:var(--sc-stage);border-radius:10px;overflow:hidden;aspect-ratio:16/9;min-height:340px}
.sc-stage video,.sc-stage canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.sc-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
.sc-card{background:var(--sc-panel);border-radius:10px;padding:18px;width:100%;max-width:560px}
.sc-card h3{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:24px;font-weight:700;margin:0 0 6px}
.sc-card p{margin:0 0 12px;color:var(--sc-steel);font-size:15px}
.sc-pair{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.sc-qr{background:#fff;border:1px solid var(--sc-line);border-radius:8px;padding:8px;flex:none;line-height:0}
.sc-pair-text{flex:1 1 220px;min-width:0}
.sc-steps{margin:0 0 12px;padding-left:20px;font-size:15px}
.sc-steps li{margin-bottom:4px}
.sc-field{display:block;font-size:13.5px;font-weight:600;margin:0 0 4px}
.sc-input{width:100%;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--sc-line);border-radius:8px;background:var(--sc-field);color:var(--sc-ink)}
.sc-linkrow{display:flex;gap:8px;margin-top:8px}
.sc-linktext{flex:1;min-width:0;font-size:12.5px;color:var(--sc-steel);word-break:break-all;margin-top:6px}
.sc-warn{margin:10px 0 0;padding:9px 11px;border-radius:8px;background:#FFF1E6;border:1px solid #F5C9A6;color:#7A3A0C;font-size:14px}
.sc-err{margin:10px 0 0;padding:9px 11px;border-radius:8px;background:#FDECEA;border:1px solid #F2B8B2;color:#7A1C14;font-size:14px}
.sc-btn{font:inherit;font-weight:600;font-size:14.5px;border-radius:8px;padding:9px 16px;border:1px solid var(--sc-ink);background:var(--sc-ink);color:var(--sc-btn-ink);cursor:pointer}
.sc-btn:hover:not(:disabled){opacity:.88}
.sc-btn.alt{background:transparent;color:var(--sc-ink);border-color:var(--sc-line)}
.sc-btn.alt:hover:not(:disabled){background:var(--sc-field);border-color:var(--sc-steel);opacity:1}
.sc-btn.rec{background:#D93025;border-color:#D93025}
.sc-btn.rec:hover:not(:disabled){background:#B9261D}
.sc-btn:disabled{opacity:.45;cursor:not-allowed}
.sc-btn:focus-visible,.sc-input:focus-visible,.sc-range:focus-visible,.sc-select:focus-visible{outline:3px solid #2F6FA8;outline-offset:2px}
.sc-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.sc-settings{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:14px;padding:12px 14px;background:var(--sc-panel);border:1px solid var(--sc-line);border-radius:10px}
.sc-setting{flex:1 1 220px;min-width:0}
.sc-select{width:100%;font:inherit;font-size:14px;padding:7px 9px;border:1px solid var(--sc-line);border-radius:8px;background:var(--sc-field);color:var(--sc-ink)}
.sc-range{width:100%;accent-color:var(--sc-move)}
.sc-rangeends{display:flex;justify-content:space-between;color:var(--sc-steel);font-size:12.5px}
.sc-live{position:absolute;top:10px;left:10px;display:flex;gap:6px}
.sc-livechip{display:inline-flex;align-items:center;gap:6px;background:rgba(14,21,27,.78);color:#fff;border-radius:999px;padding:4px 11px;font-size:13px;font-weight:600}
.sc-side{display:flex;flex-direction:column;gap:12px}
.sc-panel{background:var(--sc-panel);border:1px solid var(--sc-line);border-radius:10px;padding:16px}
.sc-big{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:104px;line-height:.85;color:var(--sc-move);letter-spacing:-.01em;display:flex;align-items:baseline;gap:10px}
.sc-big span{font-size:24px;font-weight:600;color:var(--sc-ink);letter-spacing:0}
.sc-bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--sc-barbg);margin:14px 0 12px}
.sc-bar i{display:block;height:100%;transition:width .35s ease}
.sc-bar .m{background:var(--sc-move)}
.sc-bar .i{background:var(--sc-idle)}
.sc-nums{display:flex;gap:26px}
.sc-num b{display:block;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:34px;line-height:1;font-weight:700}
.sc-num small{color:var(--sc-steel);font-size:13.5px}
.sc-key{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.sc-h4{margin:0 0 8px;font-size:15px;font-weight:600}
.sc-spark{width:100%;height:auto;display:block}
.sc-legend{display:flex;gap:16px;color:var(--sc-steel);font-size:13px;margin-top:6px}
.sc-summary{display:flex;gap:26px;margin-top:2px}
.sc-note{margin:10px 0 0;color:var(--sc-steel);font-size:13.5px}
.sc-phone{min-height:100vh;min-height:100dvh;border-radius:0;display:flex;flex-direction:column;gap:14px;padding:18px}
.sc-phone .sc-pv{position:relative;background:var(--sc-stage);border-radius:12px;overflow:hidden;aspect-ratio:3/4;width:100%;max-width:520px;margin:0 auto}
.sc-phone .sc-pv video{width:100%;height:100%;object-fit:cover;display:block}
.sc-phone .sc-pv .sc-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9FB0BF;font-size:15px;padding:20px;text-align:center}
.sc-phone .sc-col{width:100%;max-width:520px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.sc-phone .sc-btn{width:100%;padding:13px 16px;font-size:16px}
@media (prefers-reduced-motion:reduce){.sc-dot.live{animation:none}.sc-bar i{transition:none}}
`;

function Styles() {
  return <style>{CSS}</style>;
}

/* ------------------------------------------------------ small UI components */

function Spark({ history }) {
  const W = 300;
  const H = 76;
  const n = history.length;
  const maxY = Math.max(4, ...history.map((h) => h.total));
  const step = W / 89;
  const pts = (key) =>
    history
      .map((h, i) => {
        const x = W - (n - 1 - i) * step;
        const y = H - 6 - (h[key] / maxY) * (H - 14);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <>
      <svg className="sc-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="People on camera over the last 90 seconds">
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="#C9D0D6" strokeWidth="1" />
        {n > 1 && <polyline points={pts("total")} fill="none" stroke="#2F6FA8" strokeWidth="2" strokeLinejoin="round" />}
        {n > 1 && <polyline points={pts("moving")} fill="none" stroke="#F26A1B" strokeWidth="2.5" strokeLinejoin="round" />}
      </svg>
      <div className="sc-legend">
        <span><i className="sc-key" style={{ background: "#2F6FA8" }} />On camera</span>
        <span><i className="sc-key" style={{ background: "#F26A1B" }} />Moving</span>
        <span>Last 90 seconds</span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ laptop screen */

function LaptopMonitor({ style }) {
  const [phase, setPhase] = useState("idle"); // idle | starting | waiting | live
  const [hostId, setHostId] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);
  const [error, setError] = useState("");
  const [stream, setStream] = useState(null);
  const [modelBase, setModelBase] = useState("lite_mobilenet_v2");
  const [modelState, setModelState] = useState("idle"); // idle | loading | ready | error
  const [sens, setSens] = useState(0.7);
  const [stats, setStats] = useState(ZERO);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({ peak: 0, active: 0, samples: 0 });
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const qrRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const openedRef = useRef(false);
  const modelRef = useRef(null);
  const tracksRef = useRef([]);
  const idRef = useRef(1);
  const sensRef = useRef(sens);
  const logRef = useRef([]);
  const lastLogRef = useRef(0);
  const sumRef = useRef({ samples: 0, peak: 0, total: 0, moving: 0 });
  const recRef = useRef(null);
  const rtRef = useRef(null);
  const relayCanvasRef = useRef(null);
  const relayOnRef = useRef(false);
  const [sessKey, setSessKey] = useState("");

  const sessionOn = phase !== "idle";
  const link = hostId ? buildLink(baseUrl, hostId, sessKey) : "";
  const warning = linkWarning(baseUrl);

  useEffect(() => {
    sensRef.current = sens;
  }, [sens]);

  /* --- stop recording helper ---------------------------------------------- */
  const stopRecording = useCallback(() => {
    const r = recRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  /* --- session start / end ------------------------------------------------- */
  const startSession = async () => {
    setError("");
    setPhase("starting");
    logRef.current = [];
    sumRef.current = { samples: 0, peak: 0, total: 0, moving: 0 };
    lastLogRef.current = 0;
    setHistory([]);
    setSummary({ peak: 0, active: 0, samples: 0 });
    openedRef.current = false;
    try {
      await loadScript(LIBS.peer);
      const id = "infratrack-" + Math.random().toString(36).slice(2, 8);
      const peer = new window.Peer(id, await buildPeerOpts());
      peerRef.current = peer;
      const key = newKey();
      setSessKey(key);
      relayOnRef.current = false;
      rtRef.current = relayChannel(id, key, (ev, pl) => {
        if (ev === "relay-start") {
          relayOnRef.current = true;
          const old = callRef.current;
          callRef.current = null;
          try {
            old && old.close();
          } catch {}
        } else if (ev === "frame" && pl.d) {
          if (!relayOnRef.current) relayOnRef.current = true;
          const img = new Image();
          img.onload = () => {
            let c = relayCanvasRef.current;
            if (!c) {
              c = document.createElement("canvas");
              relayCanvasRef.current = c;
            }
            if (c.width !== img.width || c.height !== img.height) {
              c.width = img.width;
              c.height = img.height;
            }
            c.getContext("2d").drawImage(img, 0, 0);
            if (!c.__stream) {
              c.__stream = c.captureStream(RELAY_FPS * 2);
              setStream(c.__stream);
              setPhase("live");
            }
          };
          img.src = "data:image/jpeg;base64," + pl.d;
        } else if (ev === "bye") {
          const c = relayCanvasRef.current;
          if (c) c.__stream = null;
          relayOnRef.current = false;
          setStream(null);
          setPhase("waiting");
        }
      });

      peer.on("open", () => {
        openedRef.current = true;
        setHostId(id);
        setPhase("waiting");
      });
      peer.on("call", (call) => {
        if (callRef.current) {
          try {
            callRef.current.close();
          } catch {}
        }
        callRef.current = call;
        call.answer();
        call.on("stream", (s) => {
          if (relayOnRef.current) return;
          setStream(s);
          setPhase("live");
        });
        call.on("close", () => {
          if (callRef.current === call) {
            setStream(null);
            setPhase("waiting");
          }
        });
        call.on("error", () => {});
      });
      peer.on("disconnected", () => {
        try {
          if (!peer.destroyed) peer.reconnect();
        } catch {}
      });
      peer.on("error", (e) => {
        const net = ["network", "server-error", "socket-error", "socket-closed"].includes(e.type);
        setError(
          e.type === "unavailable-id"
            ? "That session id is taken. Start the session again."
            : net
            ? "Cannot reach the connection server. Check the internet connection and start again."
            : "Connection problem (" + e.type + ")."
        );
        if (!openedRef.current) {
          try {
            peer.destroy();
          } catch {}
          peerRef.current = null;
          setPhase("idle");
        }
      });
    } catch (e) {
      setError("Could not load the connection library. Check the internet connection.");
      setPhase("idle");
    }
  };

  const endSession = useCallback(() => {
    stopRecording();
    try {
      callRef.current && callRef.current.close();
    } catch {}
    try {
      peerRef.current && peerRef.current.destroy();
    } catch {}
    try {
      rtRef.current && rtRef.current.close();
    } catch {}
    rtRef.current = null;
    relayOnRef.current = false;
    if (relayCanvasRef.current) relayCanvasRef.current.__stream = null;
    callRef.current = null;
    peerRef.current = null;
    tracksRef.current = [];
    setStream(null);
    setHostId("");
    setStats(ZERO);
    setPhase("idle");
  }, [stopRecording]);

  useEffect(() => () => endSession(), [endSession]);

  /* --- model loading --------------------------------------------------------- */
  useEffect(() => {
    if (!sessionOn) return;
    let cancelled = false;
    setModelState("loading");
    modelRef.current = null;
    (async () => {
      try {
        await loadScript(LIBS.tf);
        await loadScript(LIBS.coco);
        const m = await window.cocoSsd.load({ base: modelBase });
        if (cancelled) return;
        modelRef.current = m;
        setModelState("ready");
      } catch {
        if (!cancelled) setModelState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionOn, modelBase]);

  /* --- QR code ------------------------------------------------------------------ */
  useEffect(() => {
    if (phase !== "waiting" || !link) return;
    try {
      if (qrRef.current) drawQr(qrRef.current, link);
    } catch {
      /* link too long for the built-in QR; the link and Copy button still work */
    }
  }, [phase, link]);

  /* --- attach remote stream to <video> ---------------------------------------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);

  /* --- tell the user when the phone is connected but no picture arrives ---------- */
  const [noVideo, setNoVideo] = useState(false);
  const [iceState, setIceState] = useState("");
  useEffect(() => {
    setNoVideo(false);
    if (!stream) return;
    let zero = 0;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      zero = v.videoWidth > 0 ? 0 : zero + 1;
      const pc = callRef.current && callRef.current.peerConnection;
      setIceState(pc ? pc.iceConnectionState : "");
      setNoVideo(zero >= 6);
      if (zero === 6 && rtRef.current && !relayOnRef.current) rtRef.current.send("need-relay");
    }, 1000);
    return () => clearInterval(id);
  }, [stream]);

  /* --- clear overlay when stream goes away ------------------------------------- */
  useEffect(() => {
    if (stream) return;
    tracksRef.current = [];
    setStats(ZERO);
    const c = canvasRef.current;
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
    stopRecording();
  }, [stream, stopRecording]);

  /* --- watchdog: phone vanished without a clean close ------------------------- */
  useEffect(() => {
    if (!stream) return;
    let last = -1;
    let same = 0;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime === last) same += 1;
      else same = 0;
      last = v.currentTime;
      if (same >= 3) {
        setStream(null);
        setPhase("waiting");
      }
    }, 2000);
    return () => clearInterval(id);
  }, [stream]);

  /* --- stats + log -------------------------------------------------------------- */
  const report = useCallback((vis) => {
    const moving = vis.filter((t) => t.moving).length;
    const next = { total: vis.length, moving, idle: vis.length - moving };
    setStats((p) => (p.total === next.total && p.moving === next.moving ? p : next));
    const nowMs = Date.now();
    if (nowMs - lastLogRef.current >= 1000) {
      lastLogRef.current = nowMs;
      const s = sumRef.current;
      s.samples += 1;
      s.peak = Math.max(s.peak, next.total);
      s.total += next.total;
      s.moving += next.moving;
      logRef.current.push({ t: nowMs, ...next });
      if (logRef.current.length > 7200) logRef.current.shift();
      setHistory(logRef.current.slice(-90));
      setSummary({ peak: s.peak, active: s.total ? s.moving / s.total : 0, samples: s.samples });
    }
  }, []);

  /* --- detection loop ----------------------------------------------------------- */
  useEffect(() => {
    if (!stream || modelState !== "ready") return;
    let stop = false;
    let timer;
    tracksRef.current = [];
    const mc = document.createElement("canvas");
    const mctx = mc.getContext("2d", { willReadFrequently: true });
    let hist = [];
    const tick = async () => {
      if (stop) return;
      const t0 = performance.now();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && modelRef.current && video.readyState >= 2 && video.videoWidth) {
        try {
          const preds = await modelRef.current.detect(video, 25, 0.55);
          if (stop) return;
          const minH = video.videoHeight * 0.08;
          const dets = preds
            .filter((p) => p.class === "person" && p.bbox[3] >= minH)
            .map((p) => ({
              x: p.bbox[0],
              y: p.bbox[1],
              w: p.bbox[2],
              h: p.bbox[3],
              cx: p.bbox[0] + p.bbox[2] / 2,
              cy: p.bbox[1] + p.bbox[3] / 2,
            }));
          const nowT = performance.now();
          tracksRef.current = updateTracks(tracksRef.current, dets, nowT, thrFromSens(sensRef.current), idRef);
          // pixel-change motion inside each box (people working in place barely move their box centre)
          try {
            const mw = 160;
            const mh = Math.max(1, Math.round((mw * video.videoHeight) / video.videoWidth));
            mc.width = mw;
            mc.height = mh;
            mctx.drawImage(video, 0, 0, mw, mh);
            const g = toGray(mctx.getImageData(0, 0, mw, mh).data, mw, mh);
            hist.push({ t: nowT, g, mw, mh });
            hist = hist.filter((f, i) => nowT - f.t < 1500 || i === hist.length - 1);
            let base = null;
            for (let i = hist.length - 1; i >= 0; i--) if (nowT - hist[i].t >= 300 && hist[i].mw === mw && hist[i].mh === mh) { base = hist[i]; break; }
            if (base) {
              const k = mw / video.videoWidth;
              const live = tracksRef.current.filter((t) => t.missed === 0);
              const boxes = live.map((t) => ({ x: t.x * k, y: t.y * k, w: t.w * k, h: t.h * k }));
              const shake = backgroundMotion(base.g, g, mw, mh, boxes) > 0.3; // whole picture moving = shaky phone
              const thrM = motionThreshold(sensRef.current);
              live.forEach((t, i) => {
                const r = boxMotion(base.g, g, mw, mh, boxes[i]);
                t.mEma = t.mEma === undefined ? r : t.mEma * 0.6 + r * 0.4;
                if (!shake) t.byDiff = t.mEma >= (t.byDiff ? thrM * 0.7 : thrM);
                t.moving = !!(t.fast || t.byDiff);
              });
            }
          } catch {
            /* motion by pixels is best-effort */
          }
          const vis = tracksRef.current.filter((t) => t.hits >= 3 && t.missed <= 1);
          drawBoxes(canvas, video, vis);
          report(vis);
        } catch {
          /* skip this frame */
        }
      }
      if (!stop) timer = setTimeout(tick, Math.max(30, 140 - (performance.now() - t0)));
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [stream, modelState, report]);

  /* --- recording + export ----------------------------------------------------- */
  const toggleRecord = () => {
    if (recording) return stopRecording();
    if (!stream || !window.MediaRecorder) {
      setError("This browser cannot record video.");
      return;
    }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) =>
      window.MediaRecorder.isTypeSupported(m)
    );
    const chunks = [];
    const rec = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      if (!chunks.length) return;
      const type = rec.mimeType || "video/webm";
      saveBlob(new Blob(chunks, { type }), `site-clip-${stamp()}.${type.includes("mp4") ? "mp4" : "webm"}`);
    };
    rec.start(1000);
    recRef.current = rec;
    setRecording(true);
  };

  const downloadCsv = () => {
    const rows = ["time,people_on_camera,moving,idle"].concat(
      logRef.current.map((r) => `${new Date(r.t).toISOString()},${r.total},${r.moving},${r.idle}`)
    );
    saveBlob(new Blob([rows.join("\n")], { type: "text/csv" }), `site-activity-${stamp()}.csv`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  /* --- render ------------------------------------------------------------------- */
  const share = stats.total ? (stats.moving / stats.total) * 100 : 0;
  const statusText = { idle: "No session", starting: "Starting", waiting: "Waiting for phone", live: "Phone connected" }[phase];
  const statusDot = phase === "live" ? "ok" : phase === "idle" ? "" : "wait";
  const modelText = { idle: "", loading: "Loading people detector", ready: "People detector ready", error: "Detector failed to load" }[modelState];

  return (
    <div className="sc-root no-print" style={style}>
      <Styles />
      <div className="sc-head">
        <div>
          <h2 className="sc-title">Site Activity Monitor</h2>
          <p className="sc-sub">Use a phone as the site camera and see how many people are on camera and how many are moving.</p>
        </div>
        <div className="sc-chips">
          <span className="sc-chip"><i className={`sc-dot ${statusDot}`} />{statusText}</span>
          {modelText && <span className="sc-chip"><i className={`sc-dot ${modelState === "ready" ? "ok" : modelState === "error" ? "" : "wait"}`} />{modelText}</span>}
        </div>
      </div>

      <div className="sc-grid">
        <div>
          <div className="sc-stage">
            <video ref={videoRef} muted playsInline autoPlay />
            <canvas ref={canvasRef} />

            {phase === "live" && noVideo && (
              <div className="sc-overlay">
                <div className="sc-card">
                  <p>Phone connected but no video is arriving yet. Put both devices on the same Wi-Fi, then tap Start camera on the phone again.</p>
                  {iceState && <p>ICE: {iceState}</p>}
                </div>
              </div>
            )}

            {phase === "live" && (
              <div className="sc-live">
                <span className="sc-livechip"><i className="sc-dot live" />Live</span>
                {recording && <span className="sc-livechip">Recording</span>}
              </div>
            )}

            {phase === "idle" && (
              <div className="sc-overlay">
                <div className="sc-card">
                  <h3>Connect a phone camera</h3>
                  <p>Start a session, scan the QR code with the phone, and its camera appears here with people counted live.</p>
                  <button className="sc-btn" onClick={startSession}>Start session</button>
                  {error && <div className="sc-err" role="alert">{error}</div>}
                </div>
              </div>
            )}

            {phase === "starting" && (
              <div className="sc-overlay">
                <div className="sc-card"><h3>Starting session</h3><p>Setting up the connection...</p></div>
              </div>
            )}

            {phase === "waiting" && (
              <div className="sc-overlay">
                <div className="sc-card">
                  <div className="sc-pair">
                    <div className="sc-qr"><canvas ref={qrRef} width="208" height="208" aria-label="QR code that opens the phone camera page" /></div>
                    <div className="sc-pair-text">
                      <h3>Scan with the phone</h3>
                      <ol className="sc-steps">
                        <li>Open the phone camera or a QR scanner and scan the code.</li>
                        <li>Tap Start camera and allow camera access.</li>
                        <li>Put the phone on a stand so the view stays steady.</li>
                      </ol>
                    </div>
                  </div>
                  <label className="sc-field" htmlFor="sc-base" style={{ marginTop: 14 }}>Phone link address</label>
                  <input id="sc-base" className="sc-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
                  {warning && <div className="sc-warn" role="alert">{warning}</div>}
                  <div className="sc-linktext">{link}</div>
                  <div className="sc-linkrow">
                    <button className="sc-btn alt" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                  </div>
                  {error && <div className="sc-err" role="alert">{error}</div>}
                </div>
              </div>
            )}
          </div>

          <div className="sc-toolbar">
            <button className={`sc-btn ${recording ? "rec" : "alt"}`} onClick={toggleRecord} disabled={phase !== "live"}>
              {recording ? "Stop and save clip" : "Record clip"}
            </button>
            <button className="sc-btn alt" onClick={downloadCsv} disabled={summary.samples === 0}>Download activity log (CSV)</button>
            {sessionOn && <button className="sc-btn alt" onClick={endSession}>End session</button>}
          </div>
          {error && phase !== "idle" && phase !== "waiting" && <div className="sc-err" role="alert">{error}</div>}

          <div className="sc-settings">
            <div className="sc-setting">
              <label className="sc-field" htmlFor="sc-model">People detector</label>
              <select id="sc-model" className="sc-select" value={modelBase} onChange={(e) => setModelBase(e.target.value)}>
                <option value="lite_mobilenet_v2">Fast (best for most laptops)</option>
                <option value="mobilenet_v2">Accurate (slower)</option>
              </select>
            </div>
            <div className="sc-setting">
              <label className="sc-field" htmlFor="sc-sens">Motion sensitivity</label>
              <input id="sc-sens" className="sc-range" type="range" min="0" max="1" step="0.05" value={sens} onChange={(e) => setSens(parseFloat(e.target.value))} />
              <div className="sc-rangeends"><span>Only walking</span><span>Small movements</span></div>
            </div>
          </div>
        </div>

        <div className="sc-side">
          <div className="sc-panel">
            <div className="sc-big">{stats.moving}<span>moving now</span></div>
            <div className="sc-bar" role="img" aria-label={`${Math.round(share)} percent of people on camera are moving`}>
              <i className="m" style={{ width: `${share}%` }} />
              <i className="i" style={{ width: `${stats.total ? 100 - share : 0}%` }} />
            </div>
            <div className="sc-nums">
              <div className="sc-num"><b>{stats.idle}</b><small><i className="sc-key" style={{ background: "#2F6FA8" }} />Idle</small></div>
              <div className="sc-num"><b>{stats.total}</b><small>On camera</small></div>
            </div>
          </div>

          <div className="sc-panel">
            <h4 className="sc-h4">Activity over time</h4>
            <Spark history={history} />
          </div>

          <div className="sc-panel">
            <h4 className="sc-h4">This session</h4>
            <div className="sc-summary">
              <div className="sc-num"><b>{summary.peak}</b><small>Most people at once</small></div>
              <div className="sc-num"><b>{Math.round(summary.active * 100)}%</b><small>Time spent moving</small></div>
            </div>
            <p className="sc-note">Counts are for people visible to the camera. A steady phone and a clear view give the best results.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- phone screen */

function PhoneSender({ hostId, relayKey }) {
  const [status, setStatus] = useState("ready"); // ready | starting | live | ended
  const [conn, setConn] = useState("");
  const [error, setError] = useState("");
  const [facing, setFacing] = useState("environment");

  const previewRef = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const wakeRef = useRef(null);
  const pollRef = useRef(null);
  const rtRef = useRef(null);
  const relayTimerRef = useRef(null);
  const relayOnRef = useRef(false);

  const releaseAll = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(relayTimerRef.current);
    try {
      rtRef.current && rtRef.current.send("bye");
    } catch {}
    try {
      rtRef.current && rtRef.current.close();
    } catch {}
    rtRef.current = null;
    relayOnRef.current = false;
    try {
      callRef.current && callRef.current.close();
    } catch {}
    try {
      peerRef.current && peerRef.current.destroy();
    } catch {}
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    try {
      wakeRef.current && wakeRef.current.release();
    } catch {}
    callRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    wakeRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", releaseAll);
    return () => {
      window.removeEventListener("pagehide", releaseAll);
      releaseAll();
    };
  }, [releaseAll]);

  const getStream = (f) =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: f }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } },
      audio: false,
    });

  const startRelay = () => {
    if (relayOnRef.current || !rtRef.current) return;
    relayOnRef.current = true;
    clearInterval(pollRef.current);
    try {
      callRef.current && callRef.current.close();
    } catch {}
    callRef.current = null;
    try {
      peerRef.current && peerRef.current.destroy();
    } catch {}
    peerRef.current = null;
    setConn("relay");
    rtRef.current.send("relay-start");
    const canvas = document.createElement("canvas");
    let busy = false;
    relayTimerRef.current = setInterval(async () => {
      const v = previewRef.current;
      if (busy || !v || !v.videoWidth) return;
      busy = true;
      try {
        const w = Math.min(960, v.videoWidth);
        canvas.width = w;
        canvas.height = Math.round((w * v.videoHeight) / v.videoWidth);
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        const d = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
        if (rtRef.current) await rtRef.current.send("frame", { d });
      } catch {}
      busy = false;
    }, 1000 / RELAY_FPS);
  };

  const start = async () => {
    setError("");
    setStatus("starting");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const err = new Error("insecure");
        err.name = "Insecure";
        throw err;
      }
      const stream = await getStream(facing);
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }
      rtRef.current = relayChannel(hostId, relayKey, (ev) => {
        if (ev === "need-relay") startRelay();
      });
      await loadScript(LIBS.peer);
      const peer = new window.Peer(await buildPeerOpts());
      peerRef.current = peer;

      peer.on("open", () => {
        const call = peer.call(hostId, stream);
        callRef.current = call;
        call.on("close", () => {
          if (relayOnRef.current) return;
          releaseAll();
          setStatus("ended");
        });
        call.on("error", () => {});
        setStatus("live");
        setConn("connecting");
        const t0 = Date.now();
        pollRef.current = setInterval(() => {
          const s = call.peerConnection && call.peerConnection.iceConnectionState;
          const good = s === "connected" || s === "completed";
          if (s) setConn(s);
          if (!good && (s === "failed" || Date.now() - t0 > 9000)) {
            if (rtRef.current) startRelay();
            else {
              releaseAll();
              setStatus("ready");
              setError("Could not reach the laptop. Make sure both devices have internet, then tap Start camera.");
            }
          }
        }, 1000);
      });
      peer.on("error", (e) => {
        releaseAll();
        setStatus("ready");
        setError(
          e.type === "peer-unavailable"
            ? "The laptop session was not found. Start a session on the laptop and scan the new QR code."
            : "Connection problem (" + e.type + "). Check the internet connection and try again."
        );
      });
      try {
        wakeRef.current = navigator.wakeLock ? await navigator.wakeLock.request("screen") : null;
      } catch {}
    } catch (e) {
      releaseAll();
      setStatus("ready");
      setError(describeMediaError(e));
    }
  };

  const flip = async () => {
    const next = facing === "environment" ? "user" : "environment";
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const ns = await getStream(next);
      const track = ns.getVideoTracks()[0];
      const pc = callRef.current && callRef.current.peerConnection;
      const sender = pc && pc.getSenders().find((s) => s.track !== undefined && (!s.track || s.track.kind === "video"));
      if (sender) await sender.replaceTrack(track);
      streamRef.current = ns;
      if (previewRef.current) previewRef.current.srcObject = ns;
      setFacing(next);
    } catch (e) {
      setError(describeMediaError(e));
    }
  };

  const stop = () => {
    releaseAll();
    setStatus("ready");
    setConn("");
  };

  const connText =
    conn === "relay"
      ? "Streaming to laptop (backup connection)"
      : conn === "connected" || conn === "completed"
      ? "Streaming to laptop"
      : conn === "disconnected"
      ? "Connection dropped, trying to recover"
      : "Connecting to laptop";

  return (
    <div className="sc-root sc-phone">
      <Styles />
      <div className="sc-col">
        <h1 className="sc-title">InfraTrack site camera</h1>
        <p className="sc-sub">This phone sends live video to the laptop dashboard.</p>
        <div className="sc-chips">
          <span className="sc-chip">
            <i className={`sc-dot ${status === "live" ? (conn === "connected" || conn === "completed" || conn === "relay" ? "ok" : "wait") : ""}`} />
            {status === "ready" && "Camera off"}
            {status === "starting" && "Starting camera"}
            {status === "live" && connText}
            {status === "ended" && "Laptop session ended"}
          </span>
        </div>
      </div>

      <div className="sc-pv">
        <video ref={previewRef} muted playsInline autoPlay />
        {status !== "live" && <div className="sc-empty">{status === "starting" ? "Opening camera..." : "Camera preview appears here"}</div>}
      </div>

      <div className="sc-col">
        {error && <div className="sc-err" role="alert">{error}</div>}
        {(status === "ready" || status === "ended") && (
          <button className="sc-btn" onClick={start}>{status === "ended" ? "Reconnect" : "Start camera"}</button>
        )}
        {status === "starting" && <button className="sc-btn" disabled>Starting...</button>}
        {status === "live" && (
          <>
            <button className="sc-btn alt" onClick={flip}>{facing === "environment" ? "Switch to front camera" : "Switch to back camera"}</button>
            <button className="sc-btn" onClick={stop}>Stop camera</button>
          </>
        )}
        <p className="sc-note">Keep this page open and the screen on. A phone stand gives steadier counts than holding it.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- export */

export default function SiteCamera({ theme } = {}) {
  const camId = (() => {
    try {
      return new URLSearchParams(window.location.search).get("cam");
    } catch {
      return null;
    }
  })();
  const relayKey = (() => {
    try {
      return new URLSearchParams(window.location.search).get("k") || "";
    } catch {
      return "";
    }
  })();
  if (camId) return <PhoneSender hostId={camId} relayKey={relayKey} />;
  // inside the workspace: borrow the app colours so it fits light and dark mode
  const vars = theme
    ? {
        "--sc-ink": theme.text, "--sc-steel": theme.textMuted, "--sc-line": theme.border, "--sc-panel": theme.panel,
        "--sc-bg": theme.bgElevated || theme.bg, "--sc-field": theme.panelAlt || theme.panel, "--sc-btn-ink": theme.bg,
        "--sc-barbg": theme.panelAlt || theme.border, "--sc-idle": theme.blue || "#2F6FA8",
      }
    : undefined;
  return <LaptopMonitor style={vars} />;
}
