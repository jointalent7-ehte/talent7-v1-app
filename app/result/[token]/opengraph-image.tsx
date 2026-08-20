import { ImageResponse } from "next/og";
import { getPublicChallengeResult } from "../../../lib/public-result-preview";

export const alt = "Talent7 official challenge result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ResultImageProps = {
  params: Promise<{ token: string }>;
};

export default async function ResultOpenGraphImage({ params }: ResultImageProps) {
  const { token } = await params;
  const result = await getPublicChallengeResult(token);
  const winner = result?.winner_name || "Official challenge result";
  const title = result?.challenge_title || "Talent7";
  const score = result?.final_score || "Result verified on Talent7";
  const activity = result?.sport_type || result?.challenge_lane || "Challenge room";
  const votes = Number(result?.vote_count || 0);
  const rating = Number(result?.rating_average || 0).toFixed(1);
  const proofs = Number(result?.proof_count || 0);

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
          background: "radial-gradient(circle at 86% 12%, #392695 0%, #11172a 36%, #070a11 76%)",
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
            OFFICIAL RESULT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1030 }}>
          <div style={{ display: "flex", color: "#aaa3ff", fontSize: 23, fontWeight: 800, textTransform: "uppercase" }}>
            {activity} · {title}
          </div>
          <div style={{ display: "flex", marginTop: 16, color: "#ffffff", fontSize: 72, fontWeight: 900, lineHeight: 1.04 }}>
            {winner}
          </div>
          <div style={{ display: "flex", marginTop: 12, color: "#ffd21f", fontSize: 32, fontWeight: 800 }}>
            Winner · {score}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: 30, fontSize: 24, fontWeight: 800 }}>{votes} votes</span>
            <span style={{ marginRight: 30, fontSize: 24, fontWeight: 800 }}>{rating}/7 rating</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{proofs} proofs</span>
          </div>
          <div style={{ display: "flex", color: "#aeb5c8", fontSize: 21 }}>jointalent7.com</div>
        </div>
      </div>
    ),
    size
  );
}
