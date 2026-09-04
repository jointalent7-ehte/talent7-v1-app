import { createClient } from "@supabase/supabase-js";
import { isRetiredGamingChallenge } from "./product-scope";

export type PublicChallengeResult = {
  challenge_title: string;
  challenge_lane: string;
  sport_type: string | null;
  match_format: string | null;
  roster_size: number | null;
  booking_region: string | null;
  team_a_name: string;
  team_b_name: string;
  winner_name: string;
  winner_side: "Team A" | "Team B" | null;
  final_score: string | null;
  completed_at: string | null;
  vote_count: number;
  rating_average: number;
  rating_count: number;
  proof_count: number;
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicChallengeResult(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .rpc("get_challenge_result_preview", { target_share_token: token })
    .maybeSingle();

  if (error || !data) return null;
  const result = data as PublicChallengeResult;
  if (isRetiredGamingChallenge({
    lane: result.challenge_lane,
    sport_type: result.sport_type,
    title: result.challenge_title
  })) return null;
  return result;
}
