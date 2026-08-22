import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicTalentTeam } from "../../../lib/public-team-preview";

export const dynamic = "force-dynamic";

type TeamPageProps = {
  params: Promise<{ token: string }>;
};

function teamDescription(name: string, type: string, activity: string, region: string) {
  return `Meet ${name}, a ${type.toLowerCase()} for ${activity} in ${region}. View its public Talent7 team card.`;
}

function teamInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T7";
}

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { token } = await params;
  const team = await getPublicTalentTeam(token);
  const title = team ? `${team.team_name} on Talent7` : "Talent7 team";
  const description = team
    ? teamDescription(team.team_name, team.team_type, team.main_activity, team.region)
    : "Open this public team card on Talent7.";
  const imageUrl = `/team/${encodeURIComponent(token)}/opengraph-image`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Talent7 public team" }]
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function PublicTeamPage({ params }: TeamPageProps) {
  const { token } = await params;
  const team = await getPublicTalentTeam(token);

  if (!team) {
    return (
      <main className="teamLanding">
        <div className="teamLandingShell">
          <header className="inviteLandingBrand">
            <Link href="/">Talent<span>7</span></Link>
            <span>Public team</span>
          </header>
          <section className="teamPreviewCard unavailable">
            <div className="teamPreviewIntro">
              <p>Team unavailable</p>
              <h1>This team link could not be opened.</h1>
              <small>It may be invalid, the team may have been removed, or team sharing may not be enabled yet.</small>
            </div>
            <div className="teamPreviewActions">
              <Link href="/#account">Open Talent7</Link>
              <Link href="/#teams">Explore teams</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const createdOn = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(team.created_at));

  return (
    <main className="teamLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="team" source="shared_team" />
      <div className="teamLandingShell">
        <header className="inviteLandingBrand">
          <Link href="/">Talent<span>7</span></Link>
          <span>Public team</span>
        </header>
        <section className="teamPreviewCard">
          <div className="teamPreviewIdentity">
            <div className="teamPreviewAvatar" aria-hidden="true">{teamInitials(team.team_name)}</div>
            <div>
              <span className="teamPreviewBadge">{team.team_type}</span>
              <h1>{team.team_name}</h1>
              <p>Led by {team.owner_name}</p>
            </div>
          </div>

          <p className="teamPreviewDescription">{team.description}</p>

          <div className="teamPreviewTags" aria-label="Team details">
            <span>{team.main_activity}</span>
            <span>{team.region}</span>
            <span>Created {createdOn}</span>
          </div>

          <div className="teamPreviewStats" aria-label="Public team activity">
            <div><strong>{Number(team.member_count || 0)}</strong><span>Members</span></div>
            <div><strong>{Number(team.challenge_count || 0)}</strong><span>Challenge rooms</span></div>
            <div><strong>{Number(team.win_count || 0)}</strong><span>Wins</span></div>
            <div><strong>{Number(team.proof_count || 0)}</strong><span>Proofs</span></div>
          </div>

          <div className="teamPreviewCallout">
            <span>Build a rivalry</span>
            <strong>Join this team or challenge them inside Talent7.</strong>
          </div>

          <div className="teamPreviewActions">
            <Link href={`/?team=${encodeURIComponent(token)}&intent=challenge#account`}>
              Challenge this team
            </Link>
            <Link href={`/?team=${encodeURIComponent(token)}&intent=join#account`}>
              Request to join
            </Link>
          </div>
          <small className="teamPreviewSafety">
            This card shows public team information and aggregate activity only. Join requests, messages, and private member details stay hidden.
          </small>
        </section>
      </div>
    </main>
  );
}
