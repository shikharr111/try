"use client";

import { useEffect, useState } from "react";
import SiteCamera from "@/infratrack/SiteCamera";

/** Phone side of the Site Activity monitor. Opened from the QR code in the workspace: /camera?cam=<id> */
export default function CameraClient() {
  const [ready, setReady] = useState(false);
  const [hasId, setHasId] = useState(false);
  useEffect(() => {
    try {
      setHasId(!!new URLSearchParams(window.location.search).get("cam"));
    } catch {
      setHasId(false);
    }
    setReady(true);
  }, []);
  if (!ready) return null;
  if (!hasId) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#0A0A0A", color: "#F5F5F5", textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>InfraTrack site camera</h1>
          <p style={{ color: "#A3A3A3", lineHeight: 1.5, margin: 0 }}>
            This page is opened by scanning the QR code in the InfraTrack workspace. Open Site Activity on the laptop, start a session, and scan the code with this phone.
          </p>
        </div>
      </main>
    );
  }
  return <SiteCamera />;
}
