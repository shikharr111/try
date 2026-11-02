/** Layout for the InfraTrack workspace. The workspace draws its own sidebar, top bar and theme, so nothing wraps it here. */
export default function InfraTrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700;800&display=swap"
        precedence="default"
      />
      <div id="main">{children}</div>
    </>
  );
}
