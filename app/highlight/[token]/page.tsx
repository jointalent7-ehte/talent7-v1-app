import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";
import { getPublicHighlightReel } from "../../../lib/public-highlight-reel";
import HighlightReelPlayer from "./highlight-reel-player";

/* eslint-disable @next/next/no-img-element -- Reel avatars use owner-selected HTTPS media with dynamic hosts. */

export const dynamic = "force-dynamic";

type HighlightPageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: HighlightPageProps): Promise<Metadata> {
  const { token } = await params;
  const reel = await getPublicHighlightReel(token);
  const title = reel ? `${reel.display_name}'s Talent7 highlights` : "Talent7 highlight reel";
  const description = reel?.tagline || (reel ? `Watch ${reel.display_name}'s proof-backed victories on Talent7.` : "Watch proof-backed competition highlights on Talent7.");
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "video.other" },
    twitter: { card: "summary_large_image", title, description }
  };
}

export default async function HighlightPage({ params }: HighlightPageProps) {
  const { token } = await params;
  const reel = await getPublicHighlightReel(token);

  if (!reel) {
    return (
      <main className="highlightLanding">
        <div className="highlightLandingShell">
          <header className="highlightBrand"><Link href="/">Talent<span>7</span></Link><span>Automatic highlights</span></header>
          <section className="highlightUnavailable">
            <span>Reel unavailable</span>
            <h1>This highlight reel is private or the link is no longer valid.</h1>
            <p>The profile owner controls whether their proof-backed moments can be shown publicly.</p>
            <div><Link href="/">Open Talent7</Link><Link href="/#profiles">Discover talent</Link></div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={`highlightLanding highlightTheme${(reel.theme || "Aurora").replace(/\s+/g, "")}`}>
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="highlight_reel" source="automatic_highlight_reel" />
      <div className="highlightLandingShell">
        <header className="highlightBrand"><Link href="/">Talent<span>7</span></Link><span>Automatic highlights</span></header>
        <section className="highlightIdentity">
          <div className="highlightIdentityCopy">
            <span>Proof-backed reel · {reel.clips.length} moment{reel.clips.length === 1 ? "" : "s"}</span>
            <h1>{reel.title}</h1>
            <p>{reel.tagline || `Recent verified wins from ${reel.display_name}.`}</p>
          </div>
          <div className="highlightOwner">
            <div>{reel.avatar_url ? <img alt="" src={reel.avatar_url} /> : reel.display_name.slice(0, 2).toUpperCase()}</div>
            <span><strong>{reel.display_name}</strong><small>@{reel.username}{reel.region ? ` · ${reel.region}` : ""}</small></span>
          </div>
        </section>

        <HighlightReelPlayer clips={reel.clips} ownerName={reel.display_name} />

        <footer className="highlightLandingFooter">
          <div><strong>Built from verified Talent7 results</strong><span>The original proof stays unchanged and remains connected to its challenge.</span></div>
          <nav><Link href={`/profile/${reel.passport_token}`}>View Passport</Link><Link href="/#create">Create a challenge</Link></nav>
        </footer>
      </div>
    </main>
  );
}
