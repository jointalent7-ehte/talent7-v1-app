import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Account",
  description: "Request Talent7 account and data deletion."
};

export default function DeleteAccountPage() {
  const deletionEmail =
    "mailto:jointalent7@gmail.com?subject=Talent7%20account%20deletion%20request&body=Hello%20Talent7%2C%0A%0AI%20want%20to%20request%20deletion%20of%20my%20Talent7%20account%20and%20related%20personal%20data.%0A%0AMy%20Talent7%20email%3A%20%0AMy%20username%20if%20known%3A%20%0AReason%20(optional)%3A%20%0A%0AThank%20you.";

  return (
    <main className="legalPage">
      <a className="legalBack" href="/">Back to Talent7</a>
      <section className="legalHero">
        <p className="eyebrow">Account deletion</p>
        <h1>Delete your Talent7 account</h1>
        <p>Use this page to request deletion of your Talent7 account and related personal data.</p>
      </section>

      <section className="legalCard legalHighlight">
        <h2>Fastest Method</h2>
        <p>
          Email Talent7 from the same email address you used for your account. Include your username if you know it.
        </p>
        <a href={deletionEmail}>Email account deletion request</a>
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
            other users' completed challenge history.
          </p>
        </article>

        <article className="legalCard">
          <h2>Expected Timing</h2>
          <p>
            Talent7 will review deletion requests as soon as reasonably possible. You may receive a reply asking
            for confirmation before deletion is completed.
          </p>
        </article>
      </section>
    </main>
  );
}
