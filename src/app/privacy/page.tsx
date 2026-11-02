import type { Metadata } from "next";
import LegalPage from "@/infratrack/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy", description: "What InfraTrack stores about you, why, and who else handles it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" other={{ href: "/terms", label: "Terms of Use" }}
      intro="InfraTrack is a site-progress tracker built by Shikhar Pratap Singh as a college mini project. This page explains, in plain words, what the site stores about you and who else handles it.">
      <h2>What we store</h2>
      <ul>
        <li><b>Your account:</b> name, email address, the role and organisation you choose when you sign up. Your password is handled by Supabase sign-in, which stores it in hashed form; we never see or store the password itself.</li>
        <li><b>Your project data:</b> everything you enter in the workspace, such as projects, plans, daily reports, activities, costs, safety incidents and the audit trail. It is saved to your account, and each account can read and change only its own data.</li>
        <li><b>Contact messages:</b> if you use the Contact button, we store your name, email, message and, if your link had them, the UTM tags (where you came from, for example <i>utm_source</i>).</li>
        <li><b>Photos:</b> the photo counter runs in your browser. The photo itself is not uploaded or saved to your account; only the counted numbers and a note about how they were counted are saved with the daily report.</li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <ul>
        <li>One sign-in cookie that keeps you logged in. It is needed for the site to work.</li>
        <li>Your browser remembers a few settings on your device only: light or dark mode, that you dismissed the cookie notice, the UTM tags of the link you first came from, and unsaved drafts of daily reports.</li>
        <li>No advertising or analytics cookies are used.</li>
      </ul>

      <h2>Who else handles data</h2>
      <p>The site could not run without these services, and they receive the data described next to them:</p>
      <ul>
        <li><b>Supabase</b> hosts sign-in and the database (your account, project data and contact messages).</li>
        <li><b>Vercel</b> hosts the website.</li>
        <li><b>Google Fonts</b> serves the font files, so your browser contacts Google when a page loads.</li>
        <li><b>Open-Meteo and BigDataCloud</b> are contacted only if you allow location access for the site weather widget; they receive your approximate coordinates to return the weather and place name.</li>
        <li><b>jsDelivr and cdnjs</b> (public code delivery networks) are contacted when you use the photo counter, PDF report or photo-format conversion, to download the code and the counting model. The Site Activity monitor also uses them, plus the free public PeerJS server and Google and Twilio STUN servers (and the free public Open Relay TURN relay when a direct connection is blocked) to connect the phone to the laptop. The video goes directly from the phone to the laptop, through the relay in encrypted form, or, as a last resort, as small still frames through InfraTrack's own Supabase realtime channel (not stored); it is not uploaded to InfraTrack, and people are counted in your browser.</li>
      </ul>
      <p>We do not sell your data and we do not show advertising.</p>

      <h2>Keeping and deleting data</h2>
      <p>You can delete a project, and all data in it, at any time from the workspace. You can download a backup of your data from the Backup &amp; Cloud page. To have your whole account and its data removed, or to ask any question about your data, send a message with the Contact button on the <a href="/">home page</a>.</p>

      <h2>Security</h2>
      <p>Data is sent over HTTPS and protected by per-account access rules in the database. No online service can promise perfect security, so please do not enter information you are not allowed to share.</p>

      <h2>Children</h2>
      <p>InfraTrack is meant for people working on construction projects and is not directed at children.</p>

      <h2>Changes to this page</h2>
      <p>If this policy changes, the date at the top will change. This page is a plain-language description of how this project works, not legal advice.</p>
    </LegalPage>
  );
}
