import { ImageResponse } from "next/og";
import { getPublicChallengeRoom } from "../../../lib/public-room-preview";

export const alt = "Talent7 challenge room";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type RoomImageProps = {
  params: Promise<{ token: string }>;
};

export default async function RoomOpenGraphImage({ params }: RoomImageProps) {
  const { token } = await params;
  const room = await getPublicChallengeRoom(token);
  const title = room?.challenge_title || "Talent7 challenge room";
  const activity = room?.sport_type || room?.challenge_lane || "Public challenge";
  const teamA = room?.team_a_name || "Challenger A";
  const teamB = room?.team_b_name || "Challenger B";
  const status = room?.is_live ? "LIVE NOW" : room?.room_status?.toUpperCase() || "CHALLENGE ROOM";
  const audience = Number(room?.audience_count || 0);
  const votes = Number(room?.vote_count || 0);
  const rating = Number(room?.rating_average || 0).toFixed(1);
  const views = Number(room?.unique_views || 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px 64px",
          color: "#f7f8ff",
          background: "radial-gradient(circle at 50% 28%, #4a256e 0%, #171a31 39%, #070a11 78%)",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 38, fontStyle: "italic", fontWeight: 900 }}>
            Talent<span style={{ color: "#ffd21f" }}>7</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 18px",
              color: room?.is_live ? "#ffffff" : "#0a0d14",
              background: room?.is_live ? "#e93545" : "#ffd21f",
              borderRadius: 999,
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: 1
            }}
          >
            {status}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", color: "#aaa3ff", fontSize: 23, fontWeight: 800, textTransform: "uppercase" }}>{activity}</div>
          <div style={{ display: "flex", marginTop: 10, color: "#ffffff", fontSize: 58, fontWeight: 900, lineHeight: 1.04 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
            <span style={{ maxWidth: 430, fontSize: 31, fontWeight: 850 }}>{teamA}</span>
            <span style={{ margin: "0 25px", color: "#ffd21f", fontSize: 25, fontWeight: 900 }}>VS</span>
            <span style={{ maxWidth: 430, fontSize: 31, fontWeight: 850 }}>{teamB}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{audience} audience</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{votes} votes</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{rating}/7</span>
            <span style={{ fontSize: 23, fontWeight: 800 }}>{views} views</span>
          </div>
          <div style={{ display: "flex", color: "#aeb5c8", fontSize: 21 }}>jointalent7.com</div>
        </div>
      </div>
    ),
    size
  );
}
