import React from "react";

const UPDATED = "29 October 2026";

/** Plain page shell for the Privacy and Terms pages. Server-rendered, no scripts. */
export default function LegalPage({ title, intro, children, other }: { title: string; intro: string; children: React.ReactNode; other: { href: string; label: string } }) {
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#F5F5F5", fontFamily: "'Manrope','Segoe UI',system-ui,sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap" precedence="default" />
      <header style={{ borderBottom: "1px solid #262626" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, color: "#F5F5F5", textDecoration: "none", fontWeight: 800, fontSize: 18 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: "#F0A93A", display: "grid", placeItems: "center" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M2.5 17.5 L8.5 10.5 L13 14 L21.5 4.5" stroke="#1B1204" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M16.5 4.5 L21.5 4.5 L21.5 9.5" stroke="#1B1204" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            InfraTrack
          </a>
          <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
            <a href="/" style={{ color: "#A3A3A3", textDecoration: "none" }}>Home</a>
            <a href={other.href} style={{ color: "#A3A3A3", textDecoration: "none" }}>{other.label}</a>
            <a href="/login" style={{ color: "#F0A93A", textDecoration: "none", fontWeight: 700 }}>Login</a>
          </nav>
        </div>
      </header>
      <main id="main" style={{ maxWidth: 860, margin: "0 auto", padding: "56px 24px 90px" }}>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 300, letterSpacing: "-0.02em", margin: "0 0 12px", lineHeight: 1.1 }}>{title}</h1>
        <div style={{ fontSize: 13, color: "#737373", marginBottom: 26, fontFamily: "ui-monospace, monospace" }}>Last updated {UPDATED}</div>
        <p style={{ fontSize: 17, lineHeight: 1.75, color: "#D4D4D4", margin: "0 0 12px" }}>{intro}</p>
        <div className="legal-body">{children}</div>
      </main>
      <style>{`
        .legal-body h2 { font-size: 22px; font-weight: 600; margin: 42px 0 12px; color: #F5F5F5; letter-spacing: -0.01em; }
        .legal-body p, .legal-body li { font-size: 16px; line-height: 1.75; color: #BDBDBD; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body ul { padding-left: 22px; margin: 0 0 14px; }
        .legal-body li { margin-bottom: 6px; }
        .legal-body a { color: #F0A93A; }
        @media print { body { background: #fff !important; } div { background: #fff !important; color: #000 !important; } .legal-body p, .legal-body li, .legal-body h2 { color: #000 !important; } }
      `}</style>
    </div>
  );
}
