export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-2xl font-semibold tracking-tight">SitePulse</div>
        <p className="mt-1 text-sm text-ink-mute">Construction progress monitoring</p>
      </div>
      <div className="card p-6">{children}</div>
    </main>
  );
}
