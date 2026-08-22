import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import GrowthEvent from "../../growth-event";

export const dynamic = "force-dynamic";

type InvitePreview = {
  invite_status: "Pending" | "Accepted" | "Declined" | "Withdrawn" | "Expired";
  expires_at: string;
  challenge_title: string;
  challenge_lane: string;
  sport_type: string | null;
  match_format: string | null;
  roster_size: number | null;
  booking_region: string | null;
  challenger_name: string;
  created_at: string;
};

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

async function getInvitePreview(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .rpc("get_challenge_invite_preview", { target_share_token: token })
    .maybeSingle();
  if (error || !data) return null;
  return data as InvitePreview;
}

export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const title = preview ? `${preview.challenger_name} challenged you to ${preview.challenge_title}` : "Challenge invitation";
  const description = preview
    ? `Preview this ${preview.sport_type || preview.challenge_lane} matchup and respond on Talent7.`
    : "Open this challenge invitation on Talent7.";

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: "/talent7-hero.png", width: 1798, height: 875, alt: "Talent7 challenge invitation" }]
    },
    twitter: { card: "summary_large_image", title, description, images: ["/talent7-hero.png"] }
  };
}

export default async function InvitePreviewPage({ params }: InvitePageProps) {
  const { token } = await params;
  const preview = await getInvitePreview(token);

  if (!preview) {
    return (
      <main className="inviteLanding">
        <div className="inviteLandingShell">
          <header className="inviteLandingBrand">
            <Link href="/">Talent<span>7</span></Link>
            <span>Challenge invite</span>
          </header>
          <section className="invitePreviewCard">
            <div className="invitePreviewIntro">
              <p>Invitation unavailable</p>
              <h1>This challenge link could not be opened.</h1>
              <small>It may be invalid, or invitation sharing may not be enabled yet.</small>
            </div>
            <div className="invitePreviewActions">
              <Link href="/#account">Open Talent7</Link>
              <Link href="/#rooms">Browse rooms</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const status = preview.invite_status;
  const canRespond = status === "Pending";
  const isAccepted = status === "Accepted";
  const responseHref = canRespond || isAccepted ? `/?invite=${encodeURIComponent(token)}#account` : "/#rooms";
  const responseLabel = canRespond ? "Log in to respond" : isAccepted ? "Open accepted challenge" : "Find a new challenge";
  const expiresAt = new Date(preview.expires_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const setup = preview.match_format
    ? `${preview.match_format}${preview.roster_size ? ` · ${preview.roster_size} per side` : ""}`
    : "Open format";

  return (
    <main className="inviteLanding">
      <GrowthEvent eventName="shared_link_view" resourceToken={token} resourceType="invite" source="shared_invite" />
      <div className="inviteLandingShell">
        <header className="inviteLandingBrand">
          <Link href="/">Talent<span>7</span></Link>
          <span>Challenge invite</span>
        </header>
        <section className="invitePreviewCard">
          <div className="invitePreviewIntro">
            <span className={`invitePreviewStatus ${status.toLowerCase()}`}>{status}</span>
            <p>{preview.challenger_name} challenged you</p>
            <h1>{preview.challenge_title}</h1>
            <small>
              Preview the matchup first. Talent7 will ask you to log in before showing private invitation controls.
            </small>
          </div>
          <div className="invitePreviewMeta">
            <div><span>Activity</span><strong>{preview.sport_type || preview.challenge_lane}</strong></div>
            <div><span>Format</span><strong>{setup}</strong></div>
            <div><span>Region</span><strong>{preview.booking_region || "To be agreed"}</strong></div>
            <div><span>Invite expires</span><strong>{expiresAt}</strong></div>
          </div>
          <div className="invitePreviewActions">
            <Link href={responseHref}>{responseLabel}</Link>
            <Link href="/#rooms">Browse challenge rooms</Link>
          </div>
          <small className="invitePreviewSafety">
            For safety, precise venue details, contact information, and private account data are never shown on a shared invitation page.
          </small>
        </section>
      </div>
    </main>
  );
}
