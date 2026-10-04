import { createClient } from "@supabase/supabase-js";

export type PublicCommunityCompetition = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  phase: string;
  capacity_per_cohort: number;
  registration_count: number;
  vote_closes_at: string | null;
  scheduled_start: string | null;
  prize_summary: string;
  eligibility_note: string;
  review_policy: string;
  activity: string | null;
  activity_pitch: string | null;
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicCommunityCompetition(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const client = publicSupabaseClient();
  if (!client) return null;
  const { data: campaign, error } = await client
    .from("talent7_competition_campaigns")
    .select("id,slug,title,summary,phase,capacity_per_cohort,registration_count,vote_closes_at,scheduled_start,prize_summary,eligibility_note,review_policy,selected_activity_option_id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !campaign || campaign.phase === "Draft") return null;

  let activity: string | null = null;
  let activityPitch: string | null = null;
  if (campaign.selected_activity_option_id) {
    const { data: option } = await client
      .from("talent7_competition_options")
      .select("activity,pitch")
      .eq("id", campaign.selected_activity_option_id)
      .eq("moderation_status", "Approved")
      .maybeSingle();
    activity = option?.activity || null;
    activityPitch = option?.pitch || null;
  }

  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    summary: campaign.summary,
    phase: campaign.phase,
    capacity_per_cohort: campaign.capacity_per_cohort,
    registration_count: campaign.registration_count,
    vote_closes_at: campaign.vote_closes_at,
    scheduled_start: campaign.scheduled_start,
    prize_summary: campaign.prize_summary,
    eligibility_note: campaign.eligibility_note,
    review_policy: campaign.review_policy,
    activity,
    activity_pitch: activityPitch
  } as PublicCommunityCompetition;
}
