import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shipping and Digital Delivery Policy",
  description: "Digital delivery policy for Talent7 one-time profile badge purchases."
};

export default function ShippingPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Shipping Policy</p>
        <h1>Shipping and Digital Delivery Policy</h1>
        <p>Last updated: August 22, 2026</p>
      </section>
      <section className="legalCard legalHighlight">
        <h2>No Physical Shipping</h2>
        <p>Talent7 sells three optional fixed-price digital profile badges. No physical goods are sold or shipped, so no courier, delivery address, or physical shipping charge applies.</p>
      </section>
      <section className="legalCard">
        <h2>How Digital Delivery Works</h2>
        <ol>
          <li>The signed-in user confirms payment with Razorpay or Google Play.</li>
          <li>Talent7 verifies the provider payment on its server.</li>
          <li>After a captured or purchased state is verified, the qualifying badge is attached to the Talent7 account and supported public profile views.</li>
        </ol>
      </section>
      <section className="legalCard">
        <h2>Delivery Time</h2>
        <p>Delivery is normally completed shortly after provider verification. Bank delays, pending Google Play purchases, webhook delays, connectivity, or account review may delay delivery. Pending, failed, cancelled, or unverified payments do not receive a badge.</p>
        <p>Android users can use <strong>Restore Google Play purchases</strong> after signing into the same Talent7 account. Website users can refresh payment status.</p>
      </section>
      <section className="legalCard">
        <h2>Delivery Problems</h2>
        <p>If a provider confirms a captured payment but the badge does not appear within 24 hours, contact jointalent7@gmail.com from your registered email. Include the provider, date, amount, and provider payment or order reference. Never email card details, a UPI PIN, password, OTP, or bank credentials.</p>
        <a href="mailto:jointalent7@gmail.com?subject=Talent7%20digital%20delivery%20issue">Report a delivery issue</a>
      </section>
    </main>
  );
}
