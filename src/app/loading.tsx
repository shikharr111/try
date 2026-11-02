import { Spinner } from "@/infratrack/SiteExtras";

/** Shown while a page is loading. */
export default function Loading() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <Spinner />
    </div>
  );
}
