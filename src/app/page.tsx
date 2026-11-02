import type { Metadata } from "next";
import LandingClient from "./landing-client";

export const metadata: Metadata = { title: { absolute: "InfraTrack — Connecting plans to reality" } };

/** First page of the site. Signed-in visitors are sent on to /workspace by the middleware. */
export default function Home() {
  return <LandingClient />;
}
