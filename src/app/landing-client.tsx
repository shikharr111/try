"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/infratrack/LandingPage";
import { captureUtm } from "@/infratrack/SiteExtras";

const UPDATED = new Date(process.env.NEXT_PUBLIC_BUILT_AT || Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The Login buttons on the landing page open the sign-in screen (or the sign-up form for "Create account"). */
export default function LandingClient() {
  const router = useRouter();
  useEffect(() => { captureUtm(); }, []);
  return <LandingPage updated={UPDATED} onLogin={(_role?: string | null, mode?: string) => router.push(mode === "register" ? "/login?mode=register" : "/login")} />;
}
