"use client";
import dynamic from "next/dynamic";
import { Spinner } from "@/infratrack/SiteExtras";

// The workspace uses browser-only APIs (window, localStorage, camera), so it is rendered on the client only.
const InfraTrack = dynamic(() => import("@/infratrack/InfraTrack"), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100vh", background: "#F5F1E8", display: "grid", placeItems: "center" }} aria-busy="true"><Spinner color="#4A4A4A" /></div>,
});

export default function WorkspaceClient({ user }: { user: { id: string; email: string; name: string } }) {
  return <InfraTrack user={user} />;
}
