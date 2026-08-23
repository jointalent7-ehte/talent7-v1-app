import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms and Conditions for Talent7 accounts, challenges, content, and digital badge purchases."
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Terms and Conditions</p>
        <h1>Talent7 Terms and Conditions</h1>
        <p>Last updated: August 23, 2026</p>
      </section>
      <section className="legalCard legalHighlight">
        <h2>Agreement</h2>
        <p>These Terms govern your use of the Talent7 website and Android application. By creating an account or using Talent7, you agree to these Terms and the Privacy Policy. If you do not agree, do not use Talent7.</p>
      </section>
      <section className="legalCard">
        <h2>Eligibility And Accounts</h2>
        <ul>
          <li>Talent7 is intended for users age 13 and over.</li>
          <li>You must provide accurate information, protect your credentials, and remain responsible for account activity.</li>
          <li>We may restrict accounts used for abuse, fraud, unsafe conduct, or violations of these Terms.</li>
        </ul>
      </section>
      <section className="legalCard">
        <h2>Challenges And User Content</h2>
        <p>Talent7 hosts structured challenge rooms, participant profiles, teams, room chat, proof, votes, ratings, and live challenge activity. These tools are provided to organize, document, judge, and complete talent, sports, and gaming challenges. You retain ownership of content you submit while granting Talent7 a non-exclusive licence to host, display, process, and share it as needed to operate the service.</p>
        <p>Do not submit illegal, infringing, deceptive, dangerous, abusive, exploitative, or privacy-invasive content. Talent7 may review reports and remove or restrict content and accounts when reasonably required.</p>
      </section>
      <section className="legalCard">
        <h2>One-Time Digital Badge Purchases</h2>
        <ul>
          <li>Core Talent7 access remains free. Digital badge purchases are optional, fixed-price products and are not subscriptions.</li>
          <li>Talent7 sells only the three defined digital profile badges displayed before checkout. There is no user-entered payment amount or person-to-person collection feature.</li>
          <li>Website payments are processed by Razorpay; Android purchases are processed by Google Play.</li>
          <li>A verified captured purchase delivers the selected permanent digital badge to the buyer&apos;s Talent7 profile.</li>
          <li>A badge does not provide ownership, investment rights, guaranteed exposure, ranking advantages, or guaranteed future features.</li>
          <li>Digital badge purchases are not challenge entry fees. Talent7 does not offer wagering, betting, cash prizes, peer-to-peer payments, or collection and transfer of funds for users.</li>
          <li>Prices, currency, and applicable taxes are shown before confirmation.</li>
        </ul>
        <p><Link href="/shipping">Shipping and Digital Delivery Policy</Link></p>
        <p><Link href="/refunds">Cancellation and Refund Policy</Link></p>
      </section>
      <section className="legalCard">
        <h2>Safety And Availability</h2>
        <p>Use appropriate precautions before participating in challenges, broadcasts, or meetups. Talent7 does not supervise real-world activity or replace emergency, medical, legal, coaching, or professional services. Features may be updated, suspended, or discontinued, and uninterrupted operation is not guaranteed.</p>
      </section>
      <section className="legalCard">
        <h2>Responsibility And Statutory Rights</h2>
        <p>Talent7 is provided on an as-available basis to the extent permitted by law. Users remain responsible for their content, conduct, decisions, devices, connectivity, and interactions. Nothing in these Terms excludes rights or remedies that cannot legally be excluded.</p>
      </section>
      <section className="legalCard">
        <h2>Contact</h2>
        <p>Questions about these Terms can be sent to jointalent7@gmail.com.</p>
        <a href="mailto:jointalent7@gmail.com?subject=Talent7%20terms%20question">Contact Talent7</a>
      </section>
    </main>
  );
}
