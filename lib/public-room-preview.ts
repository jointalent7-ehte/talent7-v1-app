import { createClient } from "@supabase/supabase-js";

export type PublicChallengeRoom = {
  challenge_title: string;
  challenge_lane: string;
  room_status: string;
  rules: string;
  sport_type: string | null;
  match_format: string | null;
  roster_size: number | null;
  booking_region: string | null;
  voting_status: string | null;
  team_a_name: string;
  team_b_name: string;
  winner_name: string | null;
  final_score: string | null;
  created_at: string;
  is_live: boolean;
  registered_players: number;
  audience_count: number;
  vote_count: number;
  rating_average: number;
  rating_count: number;
  proof_count: number;
  unique_views: number;
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicChallengeRoom(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .rpc("get_public_challenge_room_preview", { target_share_token: token })
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicChallengeRoom;
}
