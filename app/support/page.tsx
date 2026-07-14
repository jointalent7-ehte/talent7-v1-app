import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "Contact Talent7 support."
};

export default function SupportPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Back to Talent7</a>
      <section className="legalHero">
        <p className="eyebrow">Support</p>
        <h1>Talent7 support</h1>
        <p>Get help with accounts, safety, privacy, challenge rooms, proof uploads, and launch-wave questions.</p>
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
          <a href="/#feedback">Open Founder Feedback</a>
        </article>
      </section>

      <section className="legalCard">
        <h2>Emergency Reminder</h2>
        <p>
          Talent7 expert-help features are guidance only. For medical emergencies, serious injury, danger,
          or urgent local risk, contact local emergency services first.
        </p>
      </section>
    </main>
  );
}
