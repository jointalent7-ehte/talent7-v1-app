import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicTalentProfile } from "../../../lib/public-profile-preview";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  params: Promise<{ token: string }>;
};

function profileDescription(name: string, role: string, interest: string, region: string) {
  return `Meet ${name}, a ${role.toLowerCase()} interested in ${interest || "new challenges"} in ${region || "the Talent7 community"}.`;
}

function profileInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "T7";
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { token } = await params;
  const profile = await getPublicTalentProfile(token);
  const title = profile ? `${profile.display_name} (@${profile.username})` : "Talent profile";
  const description = profile
    ? profileDescription(profile.display_name, profile.role, profile.main_interest, profile.region)
    : "Open this public talent profile on Talent7.";
  const imageUrl = `/profile/${encodeURIComponent(token)}/opengraph-image`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "profile",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Talent7 public profile" }]
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { token } = await params;
  const profile = await getPublicTalentProfile(token);

  if (!profile) {
    return (
      <main className="profileLanding">
        <div className="profileLandingShell">
          <header className="inviteLandingBrand">
            <Link href="/">Talent<span>7</span></Link>
            <span>Public profile</span>
          </header>
          <section className="profilePreviewCard unavailable">
            <div className="profilePreviewIntro">
              <p>Profile unavailable</p>
              <h1>This profile link could not be opened.</h1>
              <small>It may be invalid, the profile may have been removed, or profile sharing may not be enabled yet.</small>
            </div>
            <div className="profilePreviewActions">
              <Link href="/#account">Open Talent7</Link>
              <Link href="/#profiles">Find talent</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const activities = (profile.challenge_activities || []).filter(Boolean).slice(0, 8);

  return (
    <main className="profileLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="profile" source="shared_profile" />
      <div className="profileLandingShell">
        <header className="inviteLandingBrand">
          <Link href="/">Talent<span>7</span></Link>
          <span>Public profile</span>
        </header>
        <section className="profilePreviewCard">
          <div className="profilePreviewIdentity">
            <div className="profilePreviewAvatar" aria-hidden="true">{profileInitials(profile.display_name)}</div>
            <div>
              <span className="profilePreviewBadge">
                {profile.supporter_tier ? `★ ${profile.supporter_tier}` : "Talent7 member"}
              </span>
              <h1>{profile.display_name}</h1>
              <p>@{profile.username}</p>
            </div>
          </div>

          <div className="profilePreviewTags" aria-label="Profile details">
            <span>{profile.role}</span>
            <span>{profile.main_interest || "Exploring challenges"}</span>
            <span>{profile.region || "Global"}</span>
          </div>

          <div className="profilePreviewAvailability">
            <div>
              <span>Challenge availability</span>
              <strong>{profile.challenge_availability || "Open to everyone"}</strong>
            </div>
            <div>
              <span>Preferred setup</span>
              <strong>
                {profile.challenge_skill_level || "Open"} - {profile.challenge_mode || "Either"} - {profile.challenge_format || "Any"}
              </strong>
            </div>
          </div>

          {activities.length > 0 && (
            <div className="profilePreviewActivities">
              <span>Ready to challenge</span>
              <div>{activities.map((activity) => <strong key={activity}>{activity}</strong>)}</div>
            </div>
          )}

          <div className="profilePreviewStats" aria-label="Public profile activity">
            <div><strong>{Number(profile.follower_count || 0)}</strong><span>Followers</span></div>
            <div><strong>{Number(profile.challenge_count || 0)}</strong><span>Challenge rooms</span></div>
            <div><strong>{Number(profile.completed_count || 0)}</strong><span>Completed</span></div>
            <div><strong>{Number(profile.proof_count || 0)}</strong><span>Proofs</span></div>
          </div>

          <div className="profilePreviewActions">
            <Link href={`/?profile=${encodeURIComponent(token)}&intent=challenge#account`}>
              Challenge {profile.display_name}
            </Link>
            <Link href={`/?profile=${encodeURIComponent(token)}&intent=follow#account`}>
              Follow on Talent7
            </Link>
          </div>
          <small className="profilePreviewSafety">
            This shared card contains public profile and aggregate activity only. Email, user ID, messages, and private coordination are never shown.
          </small>
        </section>
      </div>
    </main>
  );
}
