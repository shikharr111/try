import type { Metadata } from "next";
import LegalPage from "@/infratrack/LegalPage";

export const metadata: Metadata = { title: "Terms of Use", description: "The rules for using InfraTrack." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" other={{ href: "/privacy", label: "Privacy Policy" }}
      intro="By creating an account or using InfraTrack you agree to these terms. InfraTrack is a college mini project built by Shikhar Pratap Singh, offered as it is.">
      <h2>Your account</h2>
      <ul>
        <li>Give correct details when you sign up and keep your password private. You are responsible for what happens under your account.</li>
        <li>Tell us through the Contact button if you think someone else has accessed your account.</li>
      </ul>

      <h2>Your data</h2>
      <p>The projects and reports you enter belong to you. You give InfraTrack permission to store and process them only to run the service for you. See the <a href="/privacy">Privacy Policy</a> for how data is handled.</p>

      <h2>What you agree not to do</h2>
      <ul>
        <li>Do not break the law, or enter data you have no right to share.</li>
        <li>Do not try to reach other users' data, disturb the service, or probe it for weaknesses.</li>
        <li>Do not send spam or abusive messages through the Contact form, or use bots to do so.</li>
      </ul>

      <h2>Estimates are not guarantees</h2>
      <p>Delay status, forecast dates, cost projections and photo counts are calculated from what is entered, or estimated by software, and can be wrong. Check them against the real situation on site. Do not rely on InfraTrack alone for safety, legal, contractual or financial decisions.</p>

      <h2>Availability</h2>
      <p>The service may be slow, change, or be unavailable at times, and it may be stopped. Keep your own copy of important data using the backup option in the workspace.</p>

      <h2>No warranty and limit of liability</h2>
      <p>InfraTrack is provided &ldquo;as is&rdquo;, without promises that it is error-free or always available. To the extent the law allows, the developer is not liable for losses that come from using it, including lost data or decisions made from its figures.</p>

      <h2>Ending your use</h2>
      <p>You can stop using InfraTrack at any time and ask for your account to be removed. We may suspend accounts that break these terms.</p>

      <h2>Changes to these terms</h2>
      <p>If the terms change, the date at the top will change, and using the site afterwards means you accept the new version. This page is a plain-language description, not legal advice.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: use the Contact button on the <a href="/">home page</a>.</p>
    </LegalPage>
  );
}
