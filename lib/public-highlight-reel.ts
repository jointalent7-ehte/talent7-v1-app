import { createClient } from "@supabase/supabase-js";

export type PublicHighlightClip = {
  proof_url: string;
  proof_type: string;
  challenge_title: string;
  activity: string;
  competition_mode: string;
  final_score: string | null;
  xp_delta: number;
  rank_points_delta: number;
  completed_at: string;
};

export type PublicHighlightReel = {
  display_name: string;
  username: string;
  avatar_url: string | null;
  headline: string;
  region: string;
  theme: string;
  title: string;
  tagline: string;
  passport_token: string;
  clips: PublicHighlightClip[];
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicHighlightReel(token: string): Promise<PublicHighlightReel | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.rpc("get_public_talent7_highlight_reel", {
    target_share_token: token
  });
  if (error || !data || typeof data !== "object") return null;

  const reel = data as PublicHighlightReel;
  return {
    ...reel,
    clips: Array.isArray(reel.clips) ? reel.clips : []
  };
}
