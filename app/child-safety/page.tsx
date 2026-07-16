import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Child Safety Standards",
  description: "Talent7 child safety standards and CSAE reporting information."
};

export default function ChildSafetyPage() {
  return (
    <main className="legalPage">
      <a className="legalBack" href="/">
        Back to Talent7
      </a>

      <section className="legalHero">
        <p className="eyebrow">Child Safety Standards</p>
        <h1>Talent7 Child Safety Standards</h1>
        <p>Last updated: July 16, 2026</p>
      </section>

      <section className="legalCard legalHighlight">
        <h2>Our Commitment</h2>
        <p>
          Talent7 has zero tolerance for child sexual abuse and exploitation (CSAE). Talent7 is intended
          for users age 13 and over, and every user is expected to use the platform safely, honestly,
          and respectfully.
        </p>
      </section>

      <section className="legalGrid">
        <article className="legalCard">
          <h2>Zero Tolerance For CSAE</h2>
          <p>Talent7 does not allow content, behavior, links, or messages that involve:</p>
          <ul>
            <li>Child sexual abuse material or sexual exploitation of minors.</li>
            <li>Grooming, sexual solicitation of minors, or requests for sexual content from minors.</li>
            <li>Child nudity, sexualized minor content, or suggestive content involving minors.</li>
            <li>Threats, coercion, blackmail, or attempts to move minors into unsafe private contact.</li>
            <li>Instructions, links, or attempts to find, share, buy, or sell CSAE material.</li>
          </ul>
        </article>

        <article className="legalCard">
          <h2>How To Report A Child Safety Concern</h2>
          <p>
            Use the Report buttons in challenge rooms, room chat, proofs, profiles, showcase posts,
            Safety, or Feedback. You can also email Talent7 directly.
          </p>
          <p>
            <a href="mailto:jointalent7@gmail.com?subject=Talent7%20child%20safety%20concern">
              Email child safety concern
            </a>
          </p>
          <p>If someone is in immediate danger, contact local emergency services first.</p>
        </article>

        <article className="legalCard">
          <h2>What Happens After A Report</h2>
          <p>
            Talent7 reviews child safety reports as a priority and may remove content, restrict accounts,
            suspend users, preserve evidence, and report illegal material or urgent risk to appropriate
            authorities when required by law.
          </p>
        </article>

        <article className="legalCard">
          <h2>Room Chat And Meetups</h2>
          <p>
            Room chat is for safe coordination around challenges, coaching, and expert guidance. Users
            should avoid sharing phone numbers, addresses, private documents, or sensitive personal
            details in chat.
          </p>
          <p>
            Adults must not use Talent7 to contact minors in an unsafe, sexual, coercive, or
            exploitative way.
          </p>
        </article>

        <article className="legalCard">
          <h2>Designated Child Safety Contact</h2>
          <p>For child safety, moderation, legal, or compliance questions, contact:</p>
          <p>
            <a href="mailto:jointalent7@gmail.com">jointalent7@gmail.com</a>
          </p>
        </article>

        <article className="legalCard">
          <h2>For Parents, Guardians, And Users</h2>
          <p>
            Report concerns quickly and include the room, profile, proof, message, or screenshot details
            if available. Do not forward or repost illegal material. Report it through Talent7 and,
            where appropriate, to local authorities.
          </p>
        </article>
      </section>
    </main>
  );
}
