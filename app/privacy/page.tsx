import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Talent7."
};

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Privacy Policy</p>
        <h1>Talent7 Privacy Policy</h1>
        <p>Last updated: August 24, 2026</p>
      </section>

      <section className="legalCard">
        <h2>What Talent7 Is</h2>
        <p>
          Talent7 is a proof-based community app for public challenge rooms, ratings, teams, profiles,
          shared Listen rooms, live challenge activity, notifications, and launch-wave feedback. Showcase Talent,
          Coaching, and Guidance are roadmap previews rather than active launch services.
        </p>
      </section>

      <section className="legalCard">
        <h2>Information We Collect</h2>
        <ul>
          <li>Account information such as email address and login status.</li>
          <li>Profile information such as display name, username, role, main interest, and region.</li>
          <li>User content and preferences such as challenge rooms, saved-room selections, joins, votes, ratings, proof links, reports, and team requests.</li>
          <li>Legacy showcase, coaching, or expert-help records you previously submitted. Their public creation/request routes are closed, but existing records may be retained for account history, moderation, and deletion processing.</li>
          <li>Optional support or founder feedback messages you submit.</li>
          <li>Payment records such as provider, supporter product or custom contribution, amount, currency, status, provider references, and badge entitlement. Talent7 does not collect or store your complete card details, UPI PIN, banking password, or payment OTP.</li>
          <li>Basic technical information needed to run, secure, and improve the app.</li>
        </ul>
      </section>

      <section className="legalCard">
        <h2>Payments</h2>
        <p>
          Razorpay processes website payments and Google Play processes Android purchases. Talent7 sends
          the information required to create, verify, reconcile, refund, and support a transaction. Payment
          providers process payment credentials under their own terms and privacy policies. Talent7 stores
          limited provider references and verification state to reconcile supporter contributions and qualifying profile badges,
          prevent duplicate processing, handle disputes, and meet legal or accounting obligations.
        </p>
        <p><Link href="/refunds">Read the Cancellation and Refund Policy</Link></p>
      </section>

      <section className="legalCard">
        <h2>How We Use Information</h2>
        <ul>
          <li>To create and manage your Talent7 account and profile.</li>
          <li>To show challenge rooms, public ratings, votes, proof, teams, profiles, Listen rooms, and community activity.</li>
          <li>To review current safety reports and feedback, and to preserve or remove legacy records when required.</li>
          <li>To improve Talent7 before and after Play Store launch.</li>
          <li>To contact you about account, support, safety, or launch-wave matters when needed.</li>
        </ul>
      </section>

      <section className="legalCard">
        <h2>Public Content</h2>
        <p>
          Talent7 is built around public challenge activity. Your display name, username, role, region,
          challenge rooms, public votes, ratings, proofs, follows, teams, and results may be visible
          to other users. Your Saved rooms collection is private to your account. Do not submit private information
          you do not want shown publicly.
        </p>
      </section>

      <section className="legalCard">
        <h2>Sharing</h2>
        <p>
          We do not sell personal information. We may use service providers such as hosting, database,
          authentication, analytics, email, or future payment providers to operate Talent7. We may disclose
          information when required by law, to protect users, or to investigate abuse, fraud, or safety issues.
        </p>
      </section>

      <section className="legalCard">
        <h2>Account And Data Deletion</h2>
        <p>
          You can request account and data deletion from the Talent7 account deletion page. Some records may be
          retained when needed for safety, fraud prevention, legal compliance, dispute handling, or platform integrity.
        </p>
        <Link href="/delete-account">Request account deletion</Link>
      </section>

      <section className="legalCard">
        <h2>Contact</h2>
        <p>
          For privacy questions, account deletion, safety issues, or support, contact Talent7 at
          jointalent7@gmail.com.
        </p>
        <a href="mailto:jointalent7@gmail.com?subject=Talent7%20privacy%20question">Email Talent7</a>
      </section>
    </main>
  );
}
