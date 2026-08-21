import type { Metadata } from "next";
import Link from "next/link";
import { getPublicChallengeRoom } from "../../../lib/public-room-preview";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{ token: string }>;
};

function roomDescription(title: string, teamA: string, teamB: string, activity: string) {
  return `${teamA} vs ${teamB} in ${title}, a ${activity.toLowerCase()} challenge room on Talent7.`;
}

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { token } = await params;
  const room = await getPublicChallengeRoom(token);
  const title = room ? `${room.challenge_title} challenge room` : "Talent7 challenge room";
  const description = room
    ? roomDescription(room.challenge_title, room.team_a_name, room.team_b_name, room.sport_type || room.challenge_lane)
    : "Open this public challenge room preview on Talent7.";
  const imageUrl = `/room/${encodeURIComponent(token)}/opengraph-image`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Talent7 challenge room" }]
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] }
  };
}

export default async function PublicRoomPage({ params }: RoomPageProps) {
  const { token } = await params;
  const room = await getPublicChallengeRoom(token);

  if (!room) {
    return (
      <main className="publicRoomLanding">
        <div className="publicRoomLandingShell">
          <header className="inviteLandingBrand">
            <Link href="/">Talent<span>7</span></Link>
            <span>Challenge room</span>
          </header>
          <section className="publicRoomPreviewCard unavailable">
            <div className="publicRoomIntro">
              <p>Room unavailable</p>
              <h1>This challenge-room link could not be opened.</h1>
              <small>It may be invalid, the room may have been removed, or room sharing may not be enabled yet.</small>
            </div>
            <div className="publicRoomActions">
              <Link href="/#account">Open Talent7</Link>
              <Link href="/#rooms">Browse rooms</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const activity = room.sport_type || room.challenge_lane;
  const setup = room.match_format
    ? `${room.match_format}${room.roster_size ? ` - ${room.roster_size} per side` : ""}`
    : "Open format";
  const rating = Number(room.rating_average || 0).toFixed(1);
  const primaryLabel = room.room_status === "Completed" ? "Open archived room" : room.is_live ? "Watch live on Talent7" : "Join this challenge";

  return (
    <main className="publicRoomLanding">
      <div className="publicRoomLandingShell">
        <header className="inviteLandingBrand">
          <Link href="/">Talent<span>7</span></Link>
          <span>Challenge room</span>
        </header>
        <section className="publicRoomPreviewCard">
          <div className="publicRoomIntro">
            <span className={`publicRoomStatus ${room.is_live ? "live" : room.room_status.toLowerCase()}`}>
              {room.is_live ? "Live now" : room.room_status}
            </span>
            <p>{activity}</p>
            <h1>{room.challenge_title}</h1>
          </div>

          <div className="publicRoomMatchup" aria-label="Challenge matchup">
            <strong>{room.team_a_name}</strong>
            <b>VS</b>
            <strong>{room.team_b_name}</strong>
          </div>

          {room.winner_name && (
            <div className="publicRoomWinner">
              <span>Winner</span>
              <strong>{room.winner_name}</strong>
              {room.final_score && <small>Final score - {room.final_score}</small>}
            </div>
          )}

          <div className="publicRoomTags" aria-label="Room details">
            <span>{setup}</span>
            <span>{room.booking_region || "Region to be agreed"}</span>
            <span>Voting {room.voting_status?.toLowerCase() || "closed"}</span>
          </div>

          <div className="publicRoomRules">
            <span>Room rules</span>
            <p>{room.rules}</p>
          </div>

          <div className="publicRoomStats" aria-label="Public room activity">
            <div><strong>{Number(room.registered_players || 0)}</strong><span>Players</span></div>
            <div><strong>{Number(room.audience_count || 0)}</strong><span>Audience</span></div>
            <div><strong>{Number(room.vote_count || 0)}</strong><span>Votes</span></div>
            <div><strong>{rating}<small>/7</small></strong><span>Rating</span></div>
            <div><strong>{Number(room.proof_count || 0)}</strong><span>Proofs</span></div>
            <div><strong>{Number(room.unique_views || 0)}</strong><span>Views</span></div>
          </div>

          <div className="publicRoomActions">
            <Link href={`/?room=${encodeURIComponent(token)}#account`}>{primaryLabel}</Link>
            <Link href="/#rooms">Browse more rooms</Link>
          </div>
          <small className="publicRoomSafety">
            Shared room cards never expose LiveKit credentials, private chat, precise venue links, account details, or private coordination.
          </small>
        </section>
      </div>
    </main>
  );
}
