import { createClient } from "@supabase/supabase-js";

export type PublicCompetitionCertificate = {
  certificate_number: string;
  recipient_name: string;
  competition_title: string;
  activity_name: string;
  award_type: string;
  highest_round: string;
  cohort_number: number;
  verified_placement: number | null;
  verified_score: number | null;
  issued_at: string;
  is_valid: boolean;
};

function publicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export async function getPublicCompetitionCertificate(token: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return null;
  const client = publicSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .rpc("get_public_talent7_competition_certificate", { target_share_token: token })
    .maybeSingle();
  if (error || !data) return null;
  return data as PublicCompetitionCertificate;
}
