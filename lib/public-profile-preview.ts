import { createClient } from "@supabase/supabase-js";

export type PublicTalentProfile = {
  display_name: string;
  username: string;
  role: string;
  main_interest: string;
  region: string;
  challenge_availability: string;
  challenge_skill_level: string;
  challenge_mode: string;
  challenge_format: string;
  challenge_activities: string[];
  follower_count: number;
  challenge_count: number;
  completed_count: number;
  proof_count: number;
  supporter_tier: string | null;
  passport: PublicTalent7Passport | null;
};

export type PublicTalent7Rank = {
  tier: string;
  xp: number;
  rank_points: number;
  completed_count: number;
  wins: number;
  losses: number;
};

export type PublicTalent7ActivityRank = PublicTalent7Rank & {
  activity: string;
  current_streak: number;
  best_streak: number;
};

export type PublicTalent7Trophy = {
  title: string;
  detail: string;
  rarity: string;
  icon_key: string;
  earned_at: string;
};

export type PublicTalent7Result = {
  challenge_title: string;
  activity: string;
  competition_mode: string;
  won: boolean;
  proof_bonus: boolean;
  xp_delta: number;
  rank_points_delta: number;
  final_score: string | null;
  completed_at: string;
};

export type PublicTalent7Passport = {
  season: {
    name?: string;
    status?: string;
    starts_at?: string;
    ends_at?: string;
  };
  rank: PublicTalent7Rank;
  activity_ranks: PublicTalent7ActivityRank[];
  trophies: PublicTalent7Trophy[];
  recent_results: PublicTalent7Result[];
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicTalentProfile(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;

  const [profileResult, supporterResult, passportResult] = await Promise.all([
    client.rpc("get_public_profile_preview", { target_share_token: token }).maybeSingle(),
    client.rpc("get_public_supporter_badge", { target_share_token: token }),
    client.rpc("get_public_talent7_passport", { target_share_token: token })
  ]);

  if (profileResult.error || !profileResult.data) return null;
  const profile = profileResult.data as Omit<PublicTalentProfile, "supporter_tier" | "passport">;
  return {
    ...profile,
    supporter_tier: supporterResult.error ? null : String(supporterResult.data || "") || null,
    passport: passportResult.error || !passportResult.data
      ? null
      : passportResult.data as PublicTalent7Passport
  };
}
