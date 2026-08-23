import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact Talent7 support for accounts, safety, privacy, payments, and digital delivery."
};

export default function SupportPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Contact Us</p>
        <h1>Contact Talent7 support</h1>
        <p>Get help with accounts, safety, privacy, payments, digital delivery, challenge rooms, proof uploads, and launch-wave questions.</p>
      </section>

      <section className="legalGrid">
        <article className="legalCard">
          <h2>Account Help</h2>
          <p>Use this for login, email confirmation, profile, username, or account deletion questions.</p>
          <a href="mailto:jointalent7@gmail.com?subject=Talent7%20account%20support">Email account support</a>
        </article>

        <article className="legalCard">
          <h2>Safety Reports</h2>
          <p>Use the in-app safety report tools first when possible. For urgent app safety issues, email Talent7.</p>
          <a href="mailto:jointalent7@gmail.com?subject=Talent7%20safety%20report">Email safety report</a>
        </article>

        <article className="legalCard">
          <h2>Privacy Questions</h2>
          <p>Ask about data, public profile visibility, deletion, or privacy policy questions.</p>
          <a href="mailto:jointalent7@gmail.com?subject=Talent7%20privacy%20question">Email privacy question</a>
        </article>

        <article className="legalCard">
          <h2>Founder Feedback</h2>
          <p>For bugs, confusing screens, payment interest, or feature ideas, use Founder Feedback inside Talent7.</p>
          <Link href="/#feedback">Open Founder Feedback</Link>
        </article>

        <article className="legalCard">
          <h2>Payments And Refunds</h2>
          <p>Ask about a captured supporter contribution, missing qualifying badge, duplicate charge, cancellation, or refund request.</p>
          <a href="mailto:jointalent7@gmail.com?subject=Talent7%20payment%20support">Email payment support</a>
          <p><Link href="/shipping">Digital delivery policy</Link></p>
          <p><Link href="/refunds">Cancellation and refund policy</Link></p>
        </article>
      </section>

      <section className="legalCard">
        <h2>Emergency Reminder</h2>
        <p>
          Talent7 does not provide emergency, medical, legal, or professional-response services. For medical
          emergencies, serious injury, danger, or urgent local risk, contact local emergency services first.
        </p>
      </section>
    </main>
  );
}
