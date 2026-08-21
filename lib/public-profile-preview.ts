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

  const { data, error } = await client
    .rpc("get_public_profile_preview", { target_share_token: token })
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicTalentProfile;
}
