import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicCommunityCompetition } from "../../../lib/public-community-competition";

export const dynamic = "force-dynamic";

type CompetitionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
};

function formatDate(value: string | null) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function safeReferral(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^JOIN-[A-Z0-9]{9}$/i.test(candidate) ? candidate.toUpperCase() : "";
}

export async function generateMetadata({ params }: CompetitionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const competition = await getPublicCommunityCompetition(slug);
  const title = competition ? competition.title : "Talent7 community competition";
  const description = competition?.summary || "Vote, register free, and compete in a proof-reviewed Talent7 community event.";
  const imageUrl = `/competition/${encodeURIComponent(slug)}/opengraph-image`;
  return {
    title,
    description,
    robots: competition ? { index: true, follow: true } : { index: false, follow: false },
    alternates: competition ? { canonical: `/competition/${encodeURIComponent(slug)}` } : undefined,
    openGraph: { title, description, type: "website", images: [{ url: imageUrl, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function PublicCompetitionPage({ params, searchParams }: CompetitionPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const competition = await getPublicCommunityCompetition(slug);
  const referral = safeReferral(query.ref);

  if (!competition) {
    return <main className="publicCompetitionLanding unavailable"><div className="publicCompetitionShell"><header className="publicCompetitionBrand"><Link href="/">Talent<span>7</span></Link><small>Community competition</small></header><section className="publicCompetitionUnavailable"><span>Event unavailable</span><h1>This competition page cannot be opened.</h1><p>The event may be unpublished, cancelled, or the invitation link may be incorrect.</p><Link href="/#community-competition">Explore Talent7 competitions</Link></section></div></main>;
  }

  const cohortCount = Math.max(1, Math.ceil(competition.registration_count / competition.capacity_per_cohort));
  const currentCohortCount = competition.registration_count % competition.capacity_per_cohort || (competition.registration_count ? competition.capacity_per_cohort : 0);
  const joinHref = `/${referral ? `?ref=${encodeURIComponent(referral)}` : ""}#community-competition`;
  const isCancelled = competition.phase === "Cancelled";
  const eventJsonLd = competition.scheduled_start && !isCancelled ? {
    "@context": "https://schema.org",
    "@type": "Event",
    name: competition.title,
    description: competition.summary,
    startDate: competition.scheduled_start,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "VirtualLocation", url: `https://www.jointalent7.com/competition/${competition.slug}` },
    organizer: { "@type": "Organization", name: "Talent7", url: "https://www.jointalent7.com" },
    offers: { "@type": "Offer", price: 0, priceCurrency: "INR", availability: "https://schema.org/InStock", url: `https://www.jointalent7.com${joinHref}` }
  } : null;

  return (
    <main className="publicCompetitionLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={competition.id} resourceType="community_competition" source={referral ? "competition_invite" : "competition_public_page"} />
      {eventJsonLd && <script dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd).replace(/</g, "\\u003c") }} type="application/ld+json" />}
      <div className="publicCompetitionShell">
        <header className="publicCompetitionBrand"><Link href="/">Talent<span>7</span></Link><small>Community competition</small></header>

        <section className="publicCompetitionHero">
          <div><span>{competition.phase}</span><h1>{competition.title}</h1><p>{competition.summary}</p><div className="publicCompetitionHeroActions">{!isCancelled && <Link href={joinHref}>{referral ? "Accept invitation" : "Join free on Talent7"}</Link>}<Link className="secondary" href="/">Explore Talent7</Link></div><small>No entry fee. No token requirement. Reviewed competitive results.</small></div>
          <aside><span>Community demand</span><strong>{competition.registration_count}</strong><p>registered across {cohortCount} {cohortCount === 1 ? "cohort" : "cohorts"}</p><progress max={competition.capacity_per_cohort} value={currentCohortCount} /><small>Current cohort: {currentCohortCount} / {competition.capacity_per_cohort}</small></aside>
        </section>

        <section className="publicCompetitionFacts">
          <article><span>Chosen activity</span><strong>{competition.activity || "Community voting in progress"}</strong><p>{competition.activity_pitch || "Members are deciding what everyone should compete in."}</p></article>
          <article><span>{competition.scheduled_start ? "Scheduled start" : "Current vote closes"}</span><strong>{formatDate(competition.scheduled_start || competition.vote_closes_at)}</strong><p>Final heat and lane details appear privately after confirmation.</p></article>
          <article><span>Participation</span><strong>Free, scalable cohorts</strong><p>Demand creates additional cohorts instead of locking later members out.</p></article>
        </section>

        <section className="publicCompetitionTrust">
          <div><span>Prize information</span><h2>A reason to compete—not a price for entry.</h2><p>{competition.prize_summary}</p></div>
          <div><article><b>01</b><div><strong>Eligibility and delivery</strong><p>{competition.eligibility_note}</p></div></article><article><b>02</b><div><strong>Proof-reviewed results</strong><p>{competition.review_policy}</p></div></article><article><b>03</b><div><strong>Privacy by design</strong><p>Public aliases are supported. Private registration codes, footage links, addresses, and organizer case details never appear on this page.</p></div></article></div>
        </section>

        {!isCancelled && <section className="publicCompetitionFinalCta"><div><span>{referral ? "You were invited" : "The first move is yours"}</span><h2>Vote now, then reserve a free place.</h2><p>You can withdraw before competing. Registration does not guarantee a physical prize, and results stay provisional until review.</p></div><Link href={joinHref}>{referral ? "Open my invitation" : "Open the competition"}</Link></section>}
        <footer className="publicCompetitionFooter"><span>Talent7</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/support">Support</Link></footer>
      </div>
    </main>
  );
}
