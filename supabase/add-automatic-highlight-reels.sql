-- Owner-controlled, automatically curated highlight reels from proof-backed wins.
-- Run after add-profile-passport-studio.sql and add-talent7-league-rewards.sql.

begin;

alter table public.profiles
add column if not exists highlight_reel_public boolean not null default false,
add column if not exists highlight_reel_title text not null default 'My Talent7 highlights',
add column if not exists highlight_reel_tagline text not null default '',
add column if not exists highlight_reel_max_clips integer not null default 6;

alter table public.profiles
drop constraint if exists profiles_highlight_reel_title_check,
drop constraint if exists profiles_highlight_reel_tagline_check,
drop constraint if exists profiles_highlight_reel_max_clips_check;

alter table public.profiles
add constraint profiles_highlight_reel_title_check
  check (char_length(highlight_reel_title) between 2 and 70) not valid,
add constraint profiles_highlight_reel_tagline_check
  check (char_length(highlight_reel_tagline) <= 140) not valid,
add constraint profiles_highlight_reel_max_clips_check
  check (highlight_reel_max_clips between 3 and 10) not valid;

create or replace function public.get_public_talent7_highlight_reel(target_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'display_name', profile.display_name,
    'username', profile.username,
    'avatar_url', case when profile.passport_show_avatar then profile.avatar_url else null end,
    'headline', case when profile.passport_show_bio then profile.headline else '' end,
    'region', case when profile.passport_show_region then profile.region else '' end,
    'theme', profile.passport_theme,
    'title', profile.highlight_reel_title,
    'tagline', profile.highlight_reel_tagline,
    'passport_token', profile.share_token,
    'clips', coalesce((
      select jsonb_agg(to_jsonb(clip) order by clip.completed_at desc)
      from (
        select
          proof.proof_url,
          proof.proof_type,
          challenge.title as challenge_title,
          reward.activity,
          reward.competition_mode,
          challenge.final_score,
          reward.xp_delta,
          reward.rank_points_delta,
          coalesce(challenge.completed_at, reward.created_at) as completed_at
        from public.talent7_reward_events reward
        join public.challenges challenge on challenge.id = reward.challenge_id
        join lateral (
          select candidate.*
          from public.proofs candidate
          where candidate.challenge_id = challenge.id
            and candidate.user_id = profile.user_id
            and coalesce(candidate.review_status, 'Pending review') <> 'Rejected'
          order by
            case when candidate.review_status = 'Accepted' then 0 else 1 end,
            candidate.created_at desc
          limit 1
        ) proof on true
        where reward.user_id = profile.user_id
          and reward.won = true
          and challenge.status = 'Completed'
        order by coalesce(challenge.completed_at, reward.created_at) desc
        limit profile.highlight_reel_max_clips
      ) clip
    ), '[]'::jsonb)
  )
  from public.profiles profile
  where profile.share_token = target_share_token
    and profile.highlight_reel_public = true
  limit 1;
$$;

revoke all on function public.get_public_talent7_highlight_reel(uuid) from public;
grant execute on function public.get_public_talent7_highlight_reel(uuid) to anon, authenticated;

comment on function public.get_public_talent7_highlight_reel(uuid) is
'Returns an owner-enabled public reel containing only that owner''s non-rejected proof media from proof-backed Talent7 wins.';

commit;
