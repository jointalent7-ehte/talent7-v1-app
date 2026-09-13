import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicTalentProfile } from "../../../lib/public-profile-preview";
import { supporterTierLabel, type SupporterTier } from "../../../lib/supporter-products";

export const dynamic = "force-dynamic";

type ProfilePageProps = { params: Promise<{ token: string }> };

const PASSPORT_TIERS = [
  { name: "Rookie", points: 0 },
  { name: "Rising Star", points: 100 },
  { name: "Contender", points: 250 },
  { name: "Elite", points: 500 },
  { name: "Champion", points: 850 },
  { name: "Legend", points: 1300 },
  { name: "Talent7 Icon", points: 2000 }
] as const;

function profileDescription(name: string, interest: string, region: string) {
  return `Open ${name}'s Talent7 Passport to see verified competition progress, achievements, and ${interest || "challenge"} activity in ${region || "Talent7"}.`;
}

function profileInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T7";
}

function rankProgress(tier: string, points: number) {
  const foundIndex = PASSPORT_TIERS.findIndex((item) => item.name === tier);
  const tierIndex = foundIndex < 0 ? 0 : foundIndex;
  const current = PASSPORT_TIERS[tierIndex];
  const next = PASSPORT_TIERS[tierIndex + 1];
  if (!next) return { percent: 100, remaining: 0, nextName: "Peak tier" };
  const percent = Math.max(0, Math.min(100, ((points - current.points) / Math.max(1, next.points - current.points)) * 100));
  return { percent, remaining: Math.max(0, next.points - points), nextName: next.name };
}

function passportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function trophyIcon(icon: string) {
  if (icon === "victory") return "★";
  if (icon === "streak") return "⚡";
  if (icon === "tier") return "◆";
  return "🏆";
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { token } = await params;
  const profile = await getPublicTalentProfile(token);
  const title = profile ? `${profile.display_name}'s Talent7 Passport` : "Talent7 Passport";
  const description = profile
    ? profileDescription(profile.display_name, profile.main_interest, profile.region)
    : "Open this public competitive Passport on Talent7.";
  const imageUrl = `/profile/${encodeURIComponent(token)}/opengraph-image`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "profile", images: [{ url: imageUrl, width: 1200, height: 630, alt: "Talent7 Passport" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { token } = await params;
  const profile = await getPublicTalentProfile(token);

  if (!profile) {
    return (
      <main className="profileLanding"><div className="profileLandingShell">
        <header className="inviteLandingBrand"><Link href="/">Talent<span>7</span></Link><span>Talent7 Passport</span></header>
        <section className="profilePreviewCard unavailable">
          <div className="profilePreviewIntro"><p>Passport unavailable</p><h1>This Passport link could not be opened.</h1><small>It may be invalid, the profile may have been removed, or profile sharing may not be enabled yet.</small></div>
          <div className="profilePreviewActions"><Link href="/#account">Open Talent7</Link><Link href="/#profiles">Find talent</Link></div>
        </section>
      </div></main>
    );
  }

  const activities = (profile.challenge_activities || []).filter(Boolean).slice(0, 8);
  const passport = profile.passport;
  const rank = passport?.rank || { tier: "Rookie", xp: 0, rank_points: 0, completed_count: 0, wins: 0, losses: 0 };
  const progress = rankProgress(rank.tier, Number(rank.rank_points || 0));
  const decidedResults = Number(rank.wins || 0) + Number(rank.losses || 0);
  const winRate = decidedResults > 0 ? Math.round((Number(rank.wins || 0) / decidedResults) * 100) : 0;

  return (
    <main className="profileLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="profile" source="talent7_passport" />
      <div className="profileLandingShell">
        <header className="inviteLandingBrand"><Link href="/">Talent<span>7</span></Link><span>Talent7 Passport</span></header>
        <section className="profilePreviewCard">
          <div className="passportStatusLine"><span>Verified competitive identity</span><small>{passport?.season?.name || "Talent7 League"}</small></div>

          <div className="profilePreviewIdentity">
            <div className="profilePreviewAvatar" aria-hidden="true">{profileInitials(profile.display_name)}</div>
            <div>
              <span className="profilePreviewBadge">{profile.supporter_tier ? `★ ${supporterTierLabel(profile.supporter_tier as SupporterTier)}` : "Talent7 member"}</span>
              <h1>{profile.display_name}</h1><p>@{profile.username}</p>
            </div>
          </div>
          <div className="profilePreviewTags" aria-label="Profile details"><span>{profile.role}</span><span>{profile.main_interest || "Exploring challenges"}</span><span>{profile.region || "Global"}</span></div>

          <section className="passportRankCard" aria-label="Talent7 League rank">
            <div className="passportRankTopline"><div><span>Current league tier</span><strong>{rank.tier}</strong></div><b>{Number(rank.rank_points || 0)} RP</b></div>
            <div className="passportProgressTrack" aria-label={`${Math.round(progress.percent)} percent toward ${progress.nextName}`}><span style={{ width: `${progress.percent}%` }} /></div>
            <small>{progress.remaining > 0 ? `${progress.remaining} rank points to ${progress.nextName}` : "Highest Talent7 tier reached"}</small>
            <div className="passportRankStats">
              <div><strong>{Number(rank.xp || 0)}</strong><span>Season XP</span></div>
              <div><strong>{Number(rank.wins || 0)}</strong><span>Wins</span></div>
              <div><strong>{winRate}%</strong><span>Win rate</span></div>
              <div><strong>{Number(rank.completed_count || 0)}</strong><span>League results</span></div>
            </div>
          </section>

          <section className="passportSection passportTierJourney">
            <div className="passportSectionHeading"><div><span>League journey</span><h2>Seven tiers. One reputation.</h2></div><small>Only proof-backed completed challenges earn progress.</small></div>
            <div className="passportTierRail">
              {PASSPORT_TIERS.map((tier) => {
                const unlocked = Number(rank.rank_points || 0) >= tier.points;
                return <div className={unlocked ? "unlocked" : ""} key={tier.name}><i aria-hidden="true">{unlocked ? "✓" : "·"}</i><strong>{tier.name}</strong><small>{tier.points} RP</small></div>;
              })}
            </div>
          </section>

          {passport && passport.activity_ranks.length > 0 && (
            <section className="passportSection">
              <div className="passportSectionHeading"><div><span>Activity ranks</span><h2>Proven across disciplines</h2></div></div>
              <div className="passportActivityGrid">{passport.activity_ranks.map((activity) => (
                <article key={activity.activity}><span>{activity.tier}</span><h3>{activity.activity}</h3><strong>{Number(activity.rank_points || 0)} RP</strong><small>{Number(activity.wins || 0)} wins · Best streak {Number(activity.best_streak || 0)}</small></article>
              ))}</div>
            </section>
          )}

          <section className="passportSection">
            <div className="passportSectionHeading"><div><span>Trophy cabinet</span><h2>Permanent achievements</h2></div><small>{passport?.trophies.length || 0} earned</small></div>
            {passport && passport.trophies.length > 0 ? (
              <div className="passportTrophyGrid">{passport.trophies.map((trophy) => (
                <article className={trophy.rarity.toLowerCase()} key={`${trophy.title}-${trophy.earned_at}`}><i aria-hidden="true">{trophyIcon(trophy.icon_key)}</i><div><span>{trophy.rarity}</span><h3>{trophy.title}</h3><p>{trophy.detail}</p><small>Earned {passportDate(trophy.earned_at)}</small></div></article>
              ))}</div>
            ) : <div className="passportEmptyState"><strong>First trophy waiting</strong><span>Complete a challenge with proof to begin this cabinet.</span></div>}
          </section>

          {passport && passport.recent_results.length > 0 && (
            <section className="passportSection">
              <div className="passportSectionHeading"><div><span>Verified record</span><h2>Recent competition results</h2></div></div>
              <div className="passportResultsList">{passport.recent_results.map((result) => (
                <article key={`${result.challenge_title}-${result.completed_at}`}><b className={result.won ? "win" : "result"}>{result.won ? "Win" : "Completed"}</b><div><h3>{result.challenge_title}</h3><p>{result.activity} · {result.competition_mode}{result.final_score ? ` · ${result.final_score}` : ""}</p><small>{passportDate(result.completed_at)} · Proof verified</small></div><strong>+{Number(result.xp_delta || 0)} XP{Number(result.rank_points_delta || 0) > 0 ? ` · +${result.rank_points_delta} RP` : ""}</strong></article>
              ))}</div>
            </section>
          )}

          <div className="profilePreviewAvailability"><div><span>Challenge availability</span><strong>{profile.challenge_availability || "Open to everyone"}</strong></div><div><span>Preferred setup</span><strong>{profile.challenge_skill_level || "Open"} · {profile.challenge_mode || "Either"} · {profile.challenge_format || "Any"}</strong></div></div>
          {activities.length > 0 && <div className="profilePreviewActivities"><span>Ready to challenge</span><div>{activities.map((activity) => <strong key={activity}>{activity}</strong>)}</div></div>}
          <div className="profilePreviewStats" aria-label="Public profile activity"><div><strong>{Number(profile.follower_count || 0)}</strong><span>Followers</span></div><div><strong>{Number(profile.challenge_count || 0)}</strong><span>Challenge rooms</span></div><div><strong>{Number(profile.completed_count || 0)}</strong><span>Completed</span></div><div><strong>{Number(profile.proof_count || 0)}</strong><span>Proofs</span></div></div>
          <div className="profilePreviewActions"><Link href={`/?profile=${encodeURIComponent(token)}&intent=challenge#account`}>Challenge {profile.display_name}</Link><Link href="/#account">Build your Passport</Link></div>
          <small className="profilePreviewSafety">This Passport contains public profile and verified aggregate competition activity only. Email, user ID, private proof media, messages, payments, and coordination are never shown.</small>
        </section>
      </div>
    </main>
  );
}
