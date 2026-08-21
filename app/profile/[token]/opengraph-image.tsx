import { ImageResponse } from "next/og";
import { getPublicTalentProfile } from "../../../lib/public-profile-preview";

export const alt = "Talent7 public profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ProfileImageProps = {
  params: Promise<{ token: string }>;
};

function profileInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T7";
}

export default async function ProfileOpenGraphImage({ params }: ProfileImageProps) {
  const { token } = await params;
  const profile = await getPublicTalentProfile(token);
  const name = profile?.display_name || "Talent7 member";
  const username = profile?.username ? `@${profile.username}` : "Public talent profile";
  const role = profile?.role || "Challenger";
  const interest = profile?.main_interest || "Ready for the next challenge";
  const region = profile?.region || "Global";
  const followers = Number(profile?.follower_count || 0);
  const challenges = Number(profile?.challenge_count || 0);
  const completed = Number(profile?.completed_count || 0);
  const proofs = Number(profile?.proof_count || 0);

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
          background: "radial-gradient(circle at 82% 16%, #214f59 0%, #15182b 40%, #070a11 78%)",
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
            PUBLIC PROFILE
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
              background: "linear-gradient(135deg, #ffd21f, #ff8a38)",
              borderRadius: 42,
              fontSize: 62,
              fontWeight: 900
            }}
          >
            {profileInitials(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 850 }}>
            <div style={{ display: "flex", color: "#ffffff", fontSize: 66, fontWeight: 900, lineHeight: 1.04 }}>{name}</div>
            <div style={{ display: "flex", marginTop: 8, color: "#aaa3ff", fontSize: 27, fontWeight: 700 }}>{username}</div>
            <div style={{ display: "flex", marginTop: 17, color: "#ffd21f", fontSize: 28, fontWeight: 800 }}>
              {role} - {interest} - {region}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{followers} followers</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{challenges} rooms</span>
            <span style={{ marginRight: 28, fontSize: 23, fontWeight: 800 }}>{completed} completed</span>
            <span style={{ fontSize: 23, fontWeight: 800 }}>{proofs} proofs</span>
          </div>
          <div style={{ display: "flex", color: "#aeb5c8", fontSize: 21 }}>jointalent7.com</div>
        </div>
      </div>
    ),
    size
  );
}
