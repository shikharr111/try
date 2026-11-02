import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto mt-24 max-w-md px-4 text-center">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="mt-1">Page not found</h1>
      <p className="mt-2 text-sm text-ink-mute">The page does not exist, or you do not have access to it.</p>
      <Link href="/dashboard" className="btn btn-primary mt-4">Go to dashboard</Link>
    </main>
  );
}
