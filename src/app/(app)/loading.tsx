import { Skeleton } from "@/components/ui";

/** Shown while a server page is fetching. aria-busy tells assistive tech the region is loading. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-2 h-6 w-64" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="mb-4 h-72" />
      <Skeleton className="h-48" />
    </div>
  );
}
