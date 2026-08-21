import { ImageResponse } from "next/og";
import { getPublicTalentTeam } from "../../../lib/public-team-preview";

export const alt = "Talent7 public team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type TeamImageProps = {
  params: Promise<{ token: string }>;
};

function teamInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T7";
}

export default async function TeamOpenGraphImage({ params }: TeamImageProps) {
  const { token } = await params;
  const team = await getPublicTalentTeam(token);
  const name = team?.team_name || "Talent7 team";
  const type = team?.team_type || "Public team";
  const activity = team?.main_activity || "Ready for the next challenge";
  const region = team?.region || "Global";
  const owner = team?.owner_name || "Talent7 captain";
  const members = Number(team?.member_count || 0);
  const challenges = Number(team?.challenge_count || 0);
  const wins = Number(team?.win_count || 0);
  const proofs = Number(team?.proof_count || 0);

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
          background: "radial-gradient(circle at 82% 14%, #4c287d 0%, #17203b 40%, #070a11 78%)",
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
              color: "#0a0d14",
              background: "#ffd21f",
              borderRadius: 999,
              fontSize: 19,
              fontWeight: 800,
              letterSpacing: 1
            }}
          >
            PUBLIC TEAM
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 156,
              height: 156,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginRight: 34,
              color: "#111522",
              background: "linear-gradient(135deg, #ffd21f, #ff6d59)",
              borderRadius: 42,
              fontSize: 62,
              fontWeight: 900
            }}
          >
            {teamInitials(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 850 }}>
            <div style={{ display: "flex", color: "#aaa3ff", fontSize: 23, fontWeight: 800, textTransform: "uppercase" }}>{type}</div>
            <div style={{ display: "flex", marginTop: 8, color: "#ffffff", fontSize: 66, fontWeight: 900, lineHeight: 1.04 }}>{name}</div>
            <div style={{ display: "flex", marginTop: 15, color: "#ffd21f", fontSize: 27, fontWeight: 800 }}>
              {activity} - {region} - Led by {owner}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{members} members</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{challenges} rooms</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{wins} wins</span>
            <span style={{ fontSize: 23, fontWeight: 800 }}>{proofs} proofs</span>
          </div>
          <div style={{ display: "flex", color: "#aeb5c8", fontSize: 21 }}>jointalent7.com</div>
        </div>
      </div>
    ),
    size
  );
}
