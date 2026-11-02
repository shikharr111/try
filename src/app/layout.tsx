import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieBanner } from "@/infratrack/SiteExtras";

// The address the site is served from, used to build absolute links for share previews.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const DESCRIPTION = "Plan vs actual tracking for construction and infrastructure sites: daily reports, delay detection, cost, safety and forecasts in one workspace.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "InfraTrack — Connecting plans to reality", template: "%s · InfraTrack" },
  description: DESCRIPTION,
  applicationName: "InfraTrack",
  openGraph: {
    type: "website", siteName: "InfraTrack", title: "InfraTrack — Connecting plans to reality", description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "InfraTrack: plan vs actual tracking for construction sites" }],
  },
  twitter: { card: "summary_large_image", title: "InfraTrack — Connecting plans to reality", description: DESCRIPTION, images: ["/og-image.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
