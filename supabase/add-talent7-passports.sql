begin;

-- Public Passport data is deliberately returned through one narrow RPC. It
-- exposes competitive summaries only; account identifiers, proof URLs,
-- messages, payment data, and private coordination never leave the database.
create or replace function public.get_public_talent7_passport(target_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target_profile as (
    select profile.user_id
    from public.profiles profile
    where profile.share_token = target_share_token
    limit 1
  ),
  active_season as (
    select season.id, season.name, season.status, season.starts_at, season.ends_at
    from public.talent7_seasons season
    where season.status = 'Active'
    order by season.starts_at desc
    limit 1
  )
  select jsonb_build_object(
    'season', coalesce((
      select jsonb_build_object(
        'name', season.name,
        'status', season.status,
        'starts_at', season.starts_at,
        'ends_at', season.ends_at
      )
      from active_season season
    ), '{}'::jsonb),
    'rank', coalesce((
      select jsonb_build_object(
        'tier', rank_profile.tier,
        'xp', rank_profile.xp,
        'rank_points', rank_profile.rank_points,
        'completed_count', rank_profile.completed_count,
        'wins', rank_profile.wins,
        'losses', rank_profile.losses
      )
      from public.talent7_rank_profiles rank_profile
      join active_season season on season.id = rank_profile.season_id
      where rank_profile.user_id = target_profile.user_id
      limit 1
    ), jsonb_build_object(
      'tier', 'Rookie',
      'xp', 0,
      'rank_points', 0,
      'completed_count', 0,
      'wins', 0,
      'losses', 0
    )),
    'activity_ranks', coalesce((
      select jsonb_agg(to_jsonb(activity_rank) order by activity_rank.rank_points desc, activity_rank.activity)
      from (
        select
          rank.activity,
          rank.tier,
          rank.xp,
          rank.rank_points,
          rank.completed_count,
          rank.wins,
          rank.losses,
          rank.current_streak,
          rank.best_streak
        from public.talent7_activity_ranks rank
        join active_season season on season.id = rank.season_id
        where rank.user_id = target_profile.user_id
        order by rank.rank_points desc, rank.activity
        limit 6
      ) activity_rank
    ), '[]'::jsonb),
    'trophies', coalesce((
      select jsonb_agg(to_jsonb(trophy) order by trophy.earned_at desc)
      from (
        select
          achievement.title,
          achievement.detail,
          achievement.rarity,
          achievement.icon_key,
          achievement.earned_at
        from public.talent7_trophies achievement
        where achievement.user_id = target_profile.user_id
        order by achievement.earned_at desc
        limit 8
      ) trophy
    ), '[]'::jsonb),
    'recent_results', coalesce((
      select jsonb_agg(to_jsonb(result) order by result.completed_at desc)
      from (
        select
          challenge.title as challenge_title,
          reward.activity,
          reward.competition_mode,
          reward.won,
          reward.proof_bonus,
          reward.xp_delta,
          reward.rank_points_delta,
          challenge.final_score,
          coalesce(challenge.completed_at, reward.created_at) as completed_at
        from public.talent7_reward_events reward
        join public.challenges challenge on challenge.id = reward.challenge_id
        where reward.user_id = target_profile.user_id
          and challenge.status = 'Completed'
          and exists (
            select 1 from public.proofs proof where proof.challenge_id = challenge.id
          )
        order by coalesce(challenge.completed_at, reward.created_at) desc
        limit 6
      ) result
    ), '[]'::jsonb)
  )
  from target_profile;
$$;

revoke all on function public.get_public_talent7_passport(uuid) from public;
grant execute on function public.get_public_talent7_passport(uuid) to anon, authenticated;

comment on function public.get_public_talent7_passport(uuid) is
'Returns public, aggregate Talent7 Passport competition data for a profile share token. Never returns private proof media or account identifiers.';

commit;
