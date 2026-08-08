import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete Account",
  description: "Request Talent7 account and data deletion."
};

export default function DeleteAccountPage() {
  const deletionEmail =
    "mailto:jointalent7@gmail.com?subject=Talent7%20account%20deletion%20request&body=Hello%20Talent7%2C%0A%0AI%20want%20to%20request%20deletion%20of%20my%20Talent7%20account%20and%20related%20personal%20data.%0A%0AMy%20Talent7%20email%3A%20%0AMy%20username%20if%20known%3A%20%0AReason%20(optional)%3A%20%0A%0AThank%20you.";

  return (
    <main className="legalPage">
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero">
        <p className="eyebrow">Account deletion</p>
        <h1>Delete your Talent7 account</h1>
        <p>Use this page to request deletion of your Talent7 account and related personal data.</p>
      </section>

      <section className="legalCard legalHighlight">
        <h2>Fastest Method</h2>
        <p>
          Log in to Talent7, open Account, and submit the verified deletion request. You can cancel it during the
          seven-day waiting period.
        </p>
        <Link href="/#account-deletion">Open the deletion request form</Link>
        <p>
          If you cannot access the account, email Talent7 from the same address you used to sign up and include your
          username if you know it.
        </p>
        <a href={deletionEmail}>Email support for account deletion</a>
      </section>

      <section className="legalGrid">
        <article className="legalCard">
          <h2>What To Include</h2>
          <ul>
            <li>Your Talent7 account email.</li>
            <li>Your Talent7 username, if known.</li>
            <li>A clear request to delete your account and related personal data.</li>
          </ul>
        </article>

        <article className="legalCard">
          <h2>What May Be Deleted</h2>
          <ul>
            <li>Profile information.</li>
            <li>Account-linked content such as posts, requests, joins, reports, and feedback where deletion is practical.</li>
            <li>Optional support messages connected to your account.</li>
          </ul>
        </article>

        <article className="legalCard">
          <h2>What May Be Kept</h2>
          <p>
            Some information may be retained when needed for safety, abuse prevention, legal obligations,
            dispute handling, platform integrity, or records that cannot reasonably be removed without affecting
            other users&apos; completed challenge history.
          </p>
        </article>

        <article className="legalCard">
          <h2>Expected Timing</h2>
          <p>
            Authenticated requests have a seven-day cancellation period. After that, a Talent7 administrator can
            permanently remove the account, account-linked database records, and managed uploaded media.
          </p>
        </article>
      </section>
    </main>
  );
}
