"use client";
import dynamic from "next/dynamic";
import { Spinner } from "@/infratrack/SiteExtras";

// The screen uses window sizes and animation timers, so it is rendered on the client only.
const LoginScreen = dynamic(() => import("@/infratrack/LoginScreen"), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100vh", background: "#070B13", display: "grid", placeItems: "center" }} aria-busy="true"><Spinner /></div>,
});

export default function LoginClient(props: { next: string; startMode: "login" | "register"; notice: { kind: "ok" | "err"; text: string } | null }) {
  return <LoginScreen {...props} />;
}
