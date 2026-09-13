"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PublicHighlightClip } from "../../../lib/public-highlight-reel";

/* eslint-disable @next/next/no-img-element -- Reel media comes from owner-submitted proof URLs whose hosts are intentionally dynamic. */

function mediaKind(clip: PublicHighlightClip) {
  const cleanUrl = clip.proof_url.toLowerCase().split(/[?#]/)[0];
  if (clip.proof_type === "Photo" || clip.proof_type === "Screenshot" || /\.(avif|gif|jpe?g|png|webp)$/.test(cleanUrl)) return "image";
  if (clip.proof_type === "Video" && /\.(m4v|mov|mp4|webm)$/.test(cleanUrl)) return "video";
  return "link";
}

function clipDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Verified recently";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default function HighlightReelPlayer({ clips, ownerName }: { clips: PublicHighlightClip[]; ownerName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const activeClip = clips[activeIndex] || null;
  const activeKind = activeClip ? mediaKind(activeClip) : "link";
  const canNavigate = clips.length > 1;

  const showClip = useCallback((index: number) => {
    if (clips.length === 0) return;
    setActiveIndex((index + clips.length) % clips.length);
  }, [clips.length]);

  const nextClip = useCallback(() => showClip(activeIndex + 1), [activeIndex, showClip]);
  const previousClip = useCallback(() => showClip(activeIndex - 1), [activeIndex, showClip]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.key === "ArrowRight") nextClip();
      if (event.key === "ArrowLeft") previousClip();
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [nextClip, previousClip]);

  useEffect(() => {
    if (!autoPlay || !canNavigate || activeKind === "video") return;
    const timer = window.setTimeout(nextClip, 6000);
    return () => window.clearTimeout(timer);
  }, [activeKind, autoPlay, canNavigate, nextClip]);

  const progress = useMemo(() => clips.map((_, index) => index <= activeIndex), [activeIndex, clips]);

  if (!activeClip) {
    return (
      <div className="highlightEmpty">
        <span>Reel ready, moments pending</span>
        <h2>{ownerName}&apos;s next proof-backed win can appear here.</h2>
        <p>Only completed wins with the owner&apos;s saved, non-rejected proof media enter this reel.</p>
        <Link href="/#create">Start a challenge</Link>
      </div>
    );
  }

  return (
    <section className="highlightPlayer" aria-label={`${ownerName}'s automatic highlight reel`}>
      <div className="highlightProgress" aria-label={`Moment ${activeIndex + 1} of ${clips.length}`}>
        {progress.map((filled, index) => <button aria-label={`Show moment ${index + 1}`} className={filled ? "filled" : ""} key={`${clips[index].challenge_title}-${clips[index].completed_at}`} onClick={() => showClip(index)} type="button" />)}
      </div>

      <div className={`highlightMedia highlightMedia${activeKind}`}>
        {activeKind === "image" && <img alt={`${activeClip.challenge_title} proof`} src={activeClip.proof_url} />}
        {activeKind === "video" && <video autoPlay={autoPlay} controls key={activeClip.proof_url} muted={autoPlay} onEnded={nextClip} playsInline preload="metadata" src={activeClip.proof_url} />}
        {activeKind === "link" && (
          <div className="highlightLinkMoment">
            <span>Verified match link</span>
            <strong>{activeClip.challenge_title}</strong>
            <p>The original proof opens on its source platform.</p>
            <a href={activeClip.proof_url} rel="noreferrer" target="_blank">Open original proof</a>
          </div>
        )}
        <div className="highlightShade" />
        <div className="highlightMomentCopy">
          <span>{activeClip.competition_mode} · {activeClip.activity}</span>
          <h2>{activeClip.challenge_title}</h2>
          <div>
            {activeClip.final_score && <strong>{activeClip.final_score}</strong>}
            <small>{clipDate(activeClip.completed_at)}</small>
          </div>
          <footer>
            <b>Victory</b>
            <span>+{activeClip.xp_delta} XP{activeClip.rank_points_delta > 0 ? ` · +${activeClip.rank_points_delta} RP` : ""}</span>
          </footer>
        </div>
      </div>

      <div className="highlightControls">
        <button disabled={!canNavigate} onClick={previousClip} type="button">Previous</button>
        <button aria-pressed={autoPlay} className={autoPlay ? "active" : ""} onClick={() => setAutoPlay((value) => !value)} type="button">Auto play {autoPlay ? "on" : "off"}</button>
        <button disabled={!canNavigate} onClick={nextClip} type="button">Next</button>
      </div>
    </section>
  );
}
