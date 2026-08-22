import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicChallengeResult } from "../../../lib/public-result-preview";

export const dynamic = "force-dynamic";

type ResultPageProps = {
  params: Promise<{ token: string }>;
};

function resultDescription(winner: string, title: string, score?: string | null) {
  return `${winner} won ${title}${score ? ` (${score})` : ""}. See the official Talent7 result, audience rating, votes, and proof count.`;
}

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await getPublicChallengeResult(token);
  const title = result ? `${result.winner_name} won ${result.challenge_title}` : "Challenge result";
  const description = result
    ? resultDescription(result.winner_name, result.challenge_title, result.final_score)
    : "Open this official challenge result on Talent7.";
  const imageUrl = `/result/${encodeURIComponent(token)}/opengraph-image`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Talent7 official challenge result" }]
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function ResultPreviewPage({ params }: ResultPageProps) {
  const { token } = await params;
  const result = await getPublicChallengeResult(token);

  if (!result) {
    return (
      <main className="resultLanding">
        <div className="resultLandingShell">
          <header className="inviteLandingBrand">
            <Link href="/">Talent<span>7</span></Link>
            <span>Official result</span>
          </header>
          <section className="resultPreviewCard unavailable">
            <div className="resultHero">
              <p>Result unavailable</p>
              <h1>This result link could not be opened.</h1>
              <small>It may be invalid, the room may not be completed, or result sharing may not be enabled yet.</small>
            </div>
            <div className="resultPreviewActions">
              <Link href="/#account">Open Talent7</Link>
              <Link href="/#rooms">Browse rooms</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const completedOn = result.completed_at
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(result.completed_at))
    : "Date not recorded";
  const setup = result.match_format
    ? `${result.match_format}${result.roster_size ? ` · ${result.roster_size} per side` : ""}`
    : "Open format";
  const rating = Number(result.rating_average || 0).toFixed(1);

  return (
    <main className="resultLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="result" source="shared_result" />
      <div className="resultLandingShell">
        <header className="inviteLandingBrand">
          <Link href="/">Talent<span>7</span></Link>
          <span>Official result</span>
        </header>
        <section className="resultPreviewCard">
          <div className="resultHero">
            <span className="resultOfficialBadge">Completed challenge</span>
            <p>{result.sport_type || result.challenge_lane}</p>
            <h1>{result.challenge_title}</h1>
          </div>

          <div className="resultWinnerPanel">
            <span>Winner</span>
            <strong>{result.winner_name}</strong>
            <small>{result.final_score ? `Final score · ${result.final_score}` : "Final score not recorded"}</small>
          </div>

          <div className="resultMatchup" aria-label="Final matchup">
            <strong className={result.winner_side === "Team A" ? "winner" : ""}>{result.team_a_name}</strong>
            <b>VS</b>
            <strong className={result.winner_side === "Team B" ? "winner" : ""}>{result.team_b_name}</strong>
          </div>

          <div className="resultStats" aria-label="Result activity">
            <div><strong>{Number(result.vote_count || 0)}</strong><span>Audience votes</span></div>
            <div><strong>{rating}<small>/7</small></strong><span>Average rating</span></div>
            <div><strong>{Number(result.proof_count || 0)}</strong><span>Proof uploads</span></div>
          </div>

          <div className="resultPreviewMeta">
            <div><span>Format</span><strong>{setup}</strong></div>
            <div><span>Region</span><strong>{result.booking_region || "Not specified"}</strong></div>
            <div><span>Completed</span><strong>{completedOn}</strong></div>
            <div><span>Ratings</span><strong>{Number(result.rating_count || 0)} submitted</strong></div>
          </div>

          <div className="resultPreviewActions">
            <Link href="/#opponents">Create your challenge</Link>
            <Link href="/#rooms">Browse challenge rooms</Link>
          </div>
          <small className="resultPreviewSafety">
            Shared results show public matchup details and aggregate activity only. Private accounts, messages, and venue coordination stay hidden.
          </small>
        </section>
      </div>
    </main>
  );
}
