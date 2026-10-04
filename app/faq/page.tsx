import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about Talent7 accounts, challenges, community competitions, live heats, judging, prizes, privacy, and supporter badges.",
  alternates: { canonical: "/faq" }
};

const faqSections = [
  {
    id: "getting-started",
    label: "Getting started",
    questions: [
      {
        question: "What is Talent7?",
        answer:
          "Talent7 is a proof-based competition platform for sports, skills, talent, and multiplayer games. Members can create or join challenges, upload proof, compete live, build a Talent7 Passport, and take part in organized community competitions."
      },
      {
        question: "Is Talent7 free to use?",
        answer:
          "Yes. Creating an account and using the core challenge and competition features is free. Optional one-time supporter badges may be purchased, but they are never required to enter a challenge or improve a result or ranking."
      },
      {
        question: "Do I need an account?",
        answer:
          "Public competition and shared-profile pages can be viewed without an account. You need to sign in to create or join challenges, register for competitions, submit proof, vote, follow people, or manage your profile."
      },
      {
        question: "Can I use an alias instead of my real name?",
        answer:
          "Yes. You can present a public display name or alias. Talent7 may still require private account or fulfilment information for security, eligibility, or prize delivery, but that private information is not shown on your public profile."
      }
    ]
  },
  {
    id: "challenges",
    label: "Challenges",
    questions: [
      {
        question: "What is the difference between a challenge and a community competition?",
        answer:
          "A challenge is a matchup created by members or teams. A community competition is an organized event with voting, registration, scheduled heats, judging, progression, certificates, and—when announced—prizes."
      },
      {
        question: "Can anyone challenge another member?",
        answer:
          "A member who has enabled challenge availability can appear in discovery and receive compatible challenges. Open challenge rooms and queues can also help members find opponents without already knowing someone."
      },
      {
        question: "How are ordinary challenge results decided?",
        answer:
          "The room format determines how the result is recorded. A result may use participant submissions, uploaded proof, room voting, ratings, or an assigned reviewer. Results can be held for review if proof or conduct is disputed."
      },
      {
        question: "Do recorded-video challenges offer physical prizes?",
        answer:
          "Not automatically. Regular recorded challenges can award profile progress, wins, and recognition, but a prize is offered only when an official competition or approved sponsor clearly publishes one."
      }
    ]
  },
  {
    id: "competitions",
    label: "Community competitions",
    questions: [
      {
        question: "How is the next community competition chosen?",
        answer:
          "Members can vote from Talent7 suggestions and may submit another activity for consideration. Once an activity is selected, separate voting can be used to choose a suitable day and time before registration and heat scheduling are finalized."
      },
      {
        question: "What happens if more than 100 people register?",
        answer:
          "Demand does not have to close the event. Talent7 can create additional cohorts and multiple waves, each with its own heat schedule, while preserving an overall reviewed competition structure."
      },
      {
        question: "Where do I find my competition code and heat details?",
        answer:
          "After your place is confirmed, your private participant entry pass shows the information you need for the event. Do not publish private codes or participant-only room links."
      },
      {
        question: "How do live heats work?",
        answer:
          "Participants check in and join their assigned live heat. A heat can show two to four competition lanes with a shared clock. An organizer or judge controls the heat, records scores, and can retain accepted proof for the published review period."
      },
      {
        question: "What happens if I miss check-in?",
        answer:
          "The organizer may mark the place as a no-show and offer it to an eligible standby participant. Replacement depends on the event rules and timing; registration alone does not guarantee a late place."
      },
      {
        question: "Are results final immediately?",
        answer:
          "No. A result may first be shown as provisional or awaiting review. The organizer can review proof, address disputes, and then verify the outcome. Only verified results advance participants or create a final champion record."
      },
      {
        question: "Can a participant appeal a decision?",
        answer:
          "Yes, when the event provides an appeal window. Submit a concise explanation and relevant evidence through the competition dispute area. Organizers can place a result or prize fulfilment on hold while a case is reviewed."
      },
      {
        question: "Will winners receive a certificate?",
        answer:
          "Eligible verified achievements can receive a numbered digital Talent7 certificate with a public verification page. A certificate records the result; it is not an academic, government, or professional qualification."
      }
    ]
  },
  {
    id: "prizes",
    label: "Prizes and delivery",
    questions: [
      {
        question: "Do I have to pay to enter a prize competition?",
        answer:
          "No. Talent7 community competitions do not require an entry fee, token purchase, wager, or supporter badge. A prize is motivation for a skill-based event, not something funded by participant entry payments."
      },
      {
        question: "Are prizes guaranteed to every participant?",
        answer:
          "No. The competition page states the available prize, eligibility rules, number of winners, shipping region, and any alternative fulfilment. Registration does not guarantee a prize."
      },
      {
        question: "What if a winner lives outside the shipping region?",
        answer:
          "The published event rules control eligibility. When available, the organizer may offer a disclosed digital or locally deliverable alternative. Talent7 should never request banking details or payment credentials through a prize claim."
      },
      {
        question: "How is a physical prize delivered?",
        answer:
          "After the result is verified, an eligible winner submits a private claim. The organizer reviews it and records fulfilment and shipment progress. Delivery information is kept out of public profiles and public competition pages."
      }
    ]
  },
  {
    id: "live-safety",
    label: "Live rooms, proof, and safety",
    questions: [
      {
        question: "Why does Talent7 ask for camera and microphone permission?",
        answer:
          "Those permissions are used only when you choose to join a live video or voice feature. You can deny them, but you will not be able to participate on camera or speak until permission is granted in your browser or device settings."
      },
      {
        question: "Is live competition footage public?",
        answer:
          "Not automatically. Access depends on the room and event settings. Accepted proof may be retained for judging and the stated review period, while private room links, raw organizer review material, and account information are not placed on public competition pages."
      },
      {
        question: "Does AI count exercises or choose winners?",
        answer:
          "Not for current prize competitions. Human judging and proof review are used because form, visibility, connectivity, and edge cases require responsible review. Any future automated assistance should remain subject to human verification."
      },
      {
        question: "How do I report unsafe conduct or cheating?",
        answer:
          "Use the in-app report or dispute tools when possible. Include the room or competition, what happened, and relevant evidence without publishing sensitive personal information. For urgent app-safety concerns, contact Talent7 support."
      }
    ]
  },
  {
    id: "account-payments",
    label: "Accounts and payments",
    questions: [
      {
        question: "What do supporter badges provide?",
        answer:
          "They are optional permanent digital badges displayed on a Talent7 profile. They do not buy competition entry, alter judging, award rank points, guarantee exposure, or provide ownership or investment rights."
      },
      {
        question: "What should I do if my Google Play badge is missing?",
        answer:
          "Sign in to the same Talent7 and Google Play accounts used for the purchase, then use Restore Play purchases. If it still does not appear, contact payment support with the Google Play order reference—never send your password or full payment-card details."
      },
      {
        question: "How do I reset my password or confirm my email?",
        answer:
          "Use Forgot password? on the login form for a reset email. If your new account is awaiting confirmation, use Resend confirmation email and check spam or promotions folders before requesting another message."
      },
      {
        question: "Can I delete my account?",
        answer:
          "Yes. Use the account deletion control in Talent7 or the public Delete account page. Some limited records may be retained when required for security, disputes, completed transactions, or legal obligations, as described in the Privacy Policy."
      }
    ]
  }
] as const;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqSections.flatMap((section) =>
    section.questions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  )
};

export default function FaqPage() {
  return (
    <main className="legalPage faqPage">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <Link className="legalBack" href="/">Back to Talent7</Link>
      <section className="legalHero faqHero">
        <p className="eyebrow">Help centre</p>
        <h1>Questions, answered.</h1>
        <p>Clear answers about joining Talent7, competing fairly, going live, earning recognition, and staying safe.</p>
      </section>

      <nav aria-label="FAQ topics" className="faqTopics">
        {faqSections.map((section) => (
          <a href={`#${section.id}`} key={section.id}>{section.label}</a>
        ))}
      </nav>

      <div className="faqLayout">
        {faqSections.map((section, sectionIndex) => (
          <section className="faqSection" id={section.id} key={section.id}>
            <header>
              <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
              <div><p>Talent7 FAQ</p><h2>{section.label}</h2></div>
            </header>
            <div className="faqQuestions">
              {section.questions.map((item, questionIndex) => (
                <details key={item.question} open={sectionIndex === 0 && questionIndex === 0}>
                  <summary>{item.question}<span aria-hidden="true">+</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="faqContact">
        <div><p className="eyebrow">Still need help?</p><h2>Tell us what happened.</h2><p>For account, payment, privacy, safety, or technical help, contact Talent7 with the relevant room or competition details.</p></div>
        <div><Link href="/support">Open support</Link><a href="mailto:jointalent7@gmail.com?subject=Talent7%20support">Email Talent7</a></div>
      </section>

      <footer className="faqFooter">
        <span>Talent7</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/child-safety">Child safety</Link>
      </footer>
    </main>
  );
}
