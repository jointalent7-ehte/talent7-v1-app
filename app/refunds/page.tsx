import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy",
  description: "Cancellation and refund policy for Talent7 one-time supporter purchases and contributions."
};

export default function RefundsPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Cancellation and Refunds</p>
        <h1>Cancellation and Refund Policy</h1>
        <p>Last updated: August 24, 2026</p>
      </section>
      <section className="legalCard legalHighlight">
        <h2>Before Payment Completion</h2>
        <p>You can cancel by closing checkout before confirming payment. Talent7 does not grant a badge for a failed, cancelled, expired, or unverified payment.</p>
      </section>
      <section className="legalCard">
        <h2>Captured One-Time Purchases</h2>
        <p>Supporter purchases and custom contributions are one-time digital transactions and are normally final after completion. A refund may be considered for a duplicate charge, unauthorised transaction, incorrect amount, or verified qualifying payment for which Talent7 cannot deliver the associated badge.</p>
      </section>
      <section className="legalCard">
        <h2>Requesting A Refund</h2>
        <p>Contact jointalent7@gmail.com within seven days of payment from the email linked to your Talent7 account. Include the provider, date, amount, reason, and provider payment or order reference. Do not send complete card details, bank credentials, UPI PINs, passwords, or OTPs.</p>
        <a href="mailto:jointalent7@gmail.com?subject=Talent7%20refund%20request">Request a refund review</a>
      </section>
      <section className="legalCard">
        <h2>Provider Processing</h2>
        <ul>
          <li>Approved website refunds are returned through the original payment method by the provider used at checkout.</li>
          <li>Google Play purchases are also subject to Google Play billing and refund rules and may need to be requested through Google Play.</li>
          <li>Provider and bank processing times apply after approval.</li>
          <li>A refunded purchase may remove or downgrade the badge according to any remaining captured purchases.</li>
        </ul>
      </section>
      <section className="legalCard">
        <h2>Statutory Rights</h2>
        <p>This policy does not limit consumer rights or remedies that apply under law. Talent7 may request reasonable information to verify account ownership, payment status, and the basis of a request.</p>
      </section>
    </main>
  );
}
