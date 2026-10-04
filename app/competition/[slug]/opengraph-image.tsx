import { ImageResponse } from "next/og";
import { getPublicCommunityCompetition } from "../../../lib/public-community-competition";

export const alt = "Talent7 community competition";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type CompetitionImageProps = { params: Promise<{ slug: string }> };

export default async function CompetitionOpenGraphImage({ params }: CompetitionImageProps) {
  const { slug } = await params;
  const competition = await getPublicCommunityCompetition(slug);
  const title = competition?.title || "Talent7 community competition";
  const activity = competition?.activity || "The community chooses the challenge";
  const registrations = Number(competition?.registration_count || 0);
  const phase = competition?.phase || "Open";

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "58px 66px", color: "#fff", background: "radial-gradient(circle at 82% 16%, #165d5c 0%, #1b1e49 42%, #07151d 82%)", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "baseline", fontSize: 40, fontStyle: "italic", fontWeight: 900 }}>Talent<span style={{ color: "#ffd22f" }}>7</span></div><div style={{ display: "flex", padding: "10px 18px", color: "#102329", background: "#57dfc9", borderRadius: 999, fontSize: 20, fontWeight: 900 }}>{phase.toUpperCase()}</div></div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}><span style={{ color: "#ffd22f", fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>FREE COMMUNITY COMPETITION</span><div style={{ display: "flex", marginTop: 16, fontSize: 62, fontWeight: 900, lineHeight: 1.05 }}>{title}</div><div style={{ display: "flex", marginTop: 18, color: "#c9d3dc", fontSize: 30, fontWeight: 700 }}>{activity}</div></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", gap: 14 }}><span style={{ padding: "10px 16px", color: "#11252a", background: "#ffd22f", borderRadius: 12, fontSize: 22, fontWeight: 900 }}>{registrations} registered</span><span style={{ padding: "10px 16px", background: "rgba(255,255,255,.12)", borderRadius: 12, fontSize: 22, fontWeight: 800 }}>No entry fee</span></div><div style={{ display: "flex", color: "#b8c5cd", fontSize: 22 }}>jointalent7.com</div></div>
    </div>,
    size
  );
}
