-- Ranked losses continue to earn participation XP, but no longer increase rank.
-- This changes future reward events only; previously awarded rewards remain unchanged.

begin;

create or replace function public.award_talent7_challenge(target_challenge_id uuid, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_challenge public.challenges;
  target_season public.talent7_seasons;
  participant_side text;
  winner_side text;
  activity_name text;
  activity_key_value text;
  did_win boolean;
  has_personal_proof boolean;
  earned_xp integer;
  earned_rank integer;
  previous_tier text;
  next_tier text;
  reward_id uuid;
  activity_wins integer;
  activity_streak integer;
begin
  select * into target_challenge from public.challenges where id = target_challenge_id;
  if target_challenge.id is null or target_challenge.status <> 'Completed' or target_challenge.winner is null then
    return false;
  end if;
  if not exists (select 1 from public.proofs where challenge_id = target_challenge_id) then
    return false;
  end if;

  participant_side := public.talent7_challenge_side_for_user(target_challenge_id, target_user_id);
  if participant_side is null then return false; end if;

  select * into target_season
  from public.talent7_seasons
  where id = public.ensure_talent7_active_season();

  if coalesce(target_challenge.completed_at, target_challenge.created_at) < target_season.starts_at
     or coalesce(target_challenge.completed_at, target_challenge.created_at) >= target_season.ends_at then
    return false;
  end if;

  winner_side := case
    when target_challenge.winner = target_challenge.team_a then 'Team A'
    when target_challenge.winner = target_challenge.team_b then 'Team B'
    else null
  end;
  if winner_side is null then return false; end if;

  did_win := participant_side = winner_side;
  activity_name := left(coalesce(nullif(btrim(target_challenge.sport_type), ''), target_challenge.title), 100);
  activity_key_value := lower(activity_name);
  select exists (
    select 1 from public.proofs
    where challenge_id = target_challenge_id and user_id = target_user_id
  ) into has_personal_proof;

  earned_xp := case
    when target_challenge.competition_mode = 'Ranked' and did_win then 40
    when target_challenge.competition_mode = 'Ranked' then 20
    when did_win then 20
    else 10
  end + case when has_personal_proof then 5 else 0 end;
  earned_rank := case
    when target_challenge.competition_mode = 'Ranked' and did_win then 35
    else 0
  end;

  insert into public.talent7_rank_profiles (season_id, user_id)
  values (target_season.id, target_user_id)
  on conflict do nothing;

  select tier into previous_tier
  from public.talent7_rank_profiles
  where season_id = target_season.id and user_id = target_user_id;

  insert into public.talent7_reward_events (
    season_id, user_id, challenge_id, activity, competition_mode, won,
    proof_bonus, xp_delta, rank_points_delta, tier_before, tier_after
  ) values (
    target_season.id, target_user_id, target_challenge.id, activity_name,
    target_challenge.competition_mode, did_win, has_personal_proof, earned_xp,
    earned_rank, previous_tier, public.talent7_tier_for_points(
      (select rank_points from public.talent7_rank_profiles where season_id = target_season.id and user_id = target_user_id) + earned_rank
    )
  )
  on conflict (challenge_id, user_id) do nothing
  returning id into reward_id;

  if reward_id is null then return false; end if;

  update public.talent7_rank_profiles
  set xp = xp + earned_xp,
      rank_points = rank_points + earned_rank,
      tier = public.talent7_tier_for_points(rank_points + earned_rank),
      completed_count = completed_count + 1,
      wins = wins + case when did_win then 1 else 0 end,
      losses = losses + case when did_win then 0 else 1 end,
      updated_at = now()
  where season_id = target_season.id and user_id = target_user_id
  returning tier into next_tier;

  insert into public.talent7_activity_ranks (
    season_id, user_id, activity_key, activity, xp, rank_points, tier,
    completed_count, wins, losses, current_streak, best_streak
  ) values (
    target_season.id, target_user_id, activity_key_value, activity_name,
    earned_xp, earned_rank, public.talent7_tier_for_points(earned_rank), 1,
    case when did_win then 1 else 0 end,
    case when did_win then 0 else 1 end,
    case when did_win then 1 else 0 end,
    case when did_win then 1 else 0 end
  )
  on conflict (season_id, user_id, activity_key) do update
  set activity = excluded.activity,
      xp = talent7_activity_ranks.xp + excluded.xp,
      rank_points = talent7_activity_ranks.rank_points + excluded.rank_points,
      tier = public.talent7_tier_for_points(talent7_activity_ranks.rank_points + excluded.rank_points),
      completed_count = talent7_activity_ranks.completed_count + 1,
      wins = talent7_activity_ranks.wins + excluded.wins,
      losses = talent7_activity_ranks.losses + excluded.losses,
      current_streak = case when did_win then talent7_activity_ranks.current_streak + 1 else 0 end,
      best_streak = greatest(
        talent7_activity_ranks.best_streak,
        case when did_win then talent7_activity_ranks.current_streak + 1 else 0 end
      ),
      updated_at = now()
  returning wins, current_streak into activity_wins, activity_streak;

  if did_win then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'first-verified-victory', 'First verified victory',
      'Won a proof-backed Talent7 challenge.', 'Common', 'victory', target_challenge.id
    ) on conflict do nothing;
  end if;

  if activity_wins >= 5 then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'five-wins-' || md5(activity_key_value), activity_name || ' contender',
      'Earned five verified wins in ' || activity_name || '.', 'Rare', 'activity', target_challenge.id
    ) on conflict do nothing;
  end if;

  if activity_streak >= 3 then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'three-win-streak-' || md5(activity_key_value), activity_name || ' hot streak',
      'Won three verified ' || activity_name || ' challenges in a row.', 'Epic', 'streak', target_challenge.id
    ) on conflict do nothing;
  end if;

  if next_tier <> previous_tier then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'tier-' || lower(replace(next_tier, ' ', '-')), next_tier || ' unlocked',
      'Reached the ' || next_tier || ' tier in the Talent7 League.',
      case when next_tier in ('Legend', 'Talent7 Icon') then 'Legendary'
           when next_tier in ('Elite', 'Champion') then 'Epic'
           else 'Rare' end,
      'tier', target_challenge.id
    ) on conflict do nothing;
  end if;

  return true;
end;
$$;

comment on function public.award_talent7_challenge(uuid, uuid) is
  'Awards proof-backed completion XP to challengers. Ranked victories earn Rank Points; Ranked losses earn no Rank Points.';

commit;
