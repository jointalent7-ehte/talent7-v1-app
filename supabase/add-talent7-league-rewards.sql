-- Talent7 League: proof-gated seasonal ranks, activity ranks, reward history,
-- and a permanent cosmetic trophy cabinet. Clients can read progress but all
-- rewards are calculated by security-definer database functions.

alter table public.challenges
add column if not exists competition_mode text not null default 'Casual';

alter table public.challenges
drop constraint if exists challenges_competition_mode_check;

alter table public.challenges
add constraint challenges_competition_mode_check
check (competition_mode in ('Casual', 'Ranked'));

create table if not exists public.talent7_seasons (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique check (char_length(slug) between 3 and 60),
  name text not null check (char_length(name) between 3 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'Active' check (status in ('Upcoming', 'Active', 'Closed')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists talent7_one_active_season_idx
on public.talent7_seasons ((status))
where status = 'Active';

create table if not exists public.talent7_rank_profiles (
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  rank_points integer not null default 0 check (rank_points >= 0),
  tier text not null default 'Rookie' check (tier in (
    'Rookie', 'Rising Star', 'Contender', 'Elite', 'Champion', 'Legend', 'Talent7 Icon'
  )),
  completed_count integer not null default 0 check (completed_count >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create index if not exists talent7_rank_profiles_leaderboard_idx
on public.talent7_rank_profiles (season_id, rank_points desc, wins desc, updated_at);

create table if not exists public.talent7_activity_ranks (
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_key text not null check (char_length(activity_key) between 2 and 100),
  activity text not null check (char_length(activity) between 2 and 100),
  xp integer not null default 0 check (xp >= 0),
  rank_points integer not null default 0 check (rank_points >= 0),
  tier text not null default 'Rookie' check (tier in (
    'Rookie', 'Rising Star', 'Contender', 'Elite', 'Champion', 'Legend', 'Talent7 Icon'
  )),
  completed_count integer not null default 0 check (completed_count >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id, activity_key)
);

create index if not exists talent7_activity_ranks_user_idx
on public.talent7_activity_ranks (user_id, season_id, rank_points desc);

create table if not exists public.talent7_reward_events (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  activity text not null,
  competition_mode text not null check (competition_mode in ('Casual', 'Ranked')),
  won boolean not null,
  proof_bonus boolean not null default false,
  xp_delta integer not null check (xp_delta >= 0),
  rank_points_delta integer not null check (rank_points_delta >= 0),
  tier_before text not null,
  tier_after text not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index if not exists talent7_reward_events_user_idx
on public.talent7_reward_events (user_id, created_at desc);

create table if not exists public.talent7_trophies (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trophy_key text not null check (char_length(trophy_key) between 3 and 100),
  title text not null check (char_length(title) between 2 and 100),
  detail text not null check (char_length(detail) between 2 and 220),
  rarity text not null default 'Common' check (rarity in ('Common', 'Rare', 'Epic', 'Legendary')),
  icon_key text not null default 'trophy',
  source_challenge_id uuid references public.challenges(id) on delete set null,
  earned_at timestamptz not null default now(),
  unique (user_id, trophy_key)
);

create index if not exists talent7_trophies_user_idx
on public.talent7_trophies (user_id, earned_at desc);

alter table public.talent7_seasons enable row level security;
alter table public.talent7_rank_profiles enable row level security;
alter table public.talent7_activity_ranks enable row level security;
alter table public.talent7_reward_events enable row level security;
alter table public.talent7_trophies enable row level security;

revoke all on public.talent7_seasons, public.talent7_rank_profiles,
  public.talent7_activity_ranks, public.talent7_reward_events, public.talent7_trophies
from anon, authenticated;

grant select on public.talent7_seasons, public.talent7_rank_profiles,
  public.talent7_activity_ranks, public.talent7_trophies
to authenticated;
grant select on public.talent7_reward_events to authenticated;

drop policy if exists "Authenticated users read Talent7 seasons" on public.talent7_seasons;
create policy "Authenticated users read Talent7 seasons"
on public.talent7_seasons for select to authenticated using (true);

drop policy if exists "Authenticated users read Talent7 ranks" on public.talent7_rank_profiles;
create policy "Authenticated users read Talent7 ranks"
on public.talent7_rank_profiles for select to authenticated using (true);

drop policy if exists "Authenticated users read Talent7 activity ranks" on public.talent7_activity_ranks;
create policy "Authenticated users read Talent7 activity ranks"
on public.talent7_activity_ranks for select to authenticated using (true);

drop policy if exists "Users read their own Talent7 rewards" on public.talent7_reward_events;
create policy "Users read their own Talent7 rewards"
on public.talent7_reward_events for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users read Talent7 trophies" on public.talent7_trophies;
create policy "Authenticated users read Talent7 trophies"
on public.talent7_trophies for select to authenticated using (true);

create or replace function public.talent7_tier_for_points(points integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when greatest(coalesce(points, 0), 0) >= 2000 then 'Talent7 Icon'
    when greatest(coalesce(points, 0), 0) >= 1300 then 'Legend'
    when greatest(coalesce(points, 0), 0) >= 850 then 'Champion'
    when greatest(coalesce(points, 0), 0) >= 500 then 'Elite'
    when greatest(coalesce(points, 0), 0) >= 250 then 'Contender'
    when greatest(coalesce(points, 0), 0) >= 100 then 'Rising Star'
    else 'Rookie'
  end;
$$;

create or replace function public.ensure_talent7_active_season()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
  season_start timestamptz := date_trunc('week', now());
begin
  select id into target_id
  from public.talent7_seasons
  where status = 'Active' and now() >= starts_at and now() < ends_at
  order by starts_at desc
  limit 1;

  if target_id is not null then return target_id; end if;

  update public.talent7_seasons set status = 'Closed' where status = 'Active';
  insert into public.talent7_seasons (slug, name, starts_at, ends_at, status)
  values (
    'season-' || to_char(season_start, 'YYYY-MM-DD'),
    'Talent7 Season ' || to_char(season_start, 'Mon YYYY'),
    season_start,
    season_start + interval '12 weeks',
    'Active'
  )
  on conflict (slug) do update set status = 'Active'
  returning id into target_id;

  return target_id;
end;
$$;

create or replace function public.talent7_challenge_side_for_user(target_challenge_id uuid, target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select * from public.challenges where id = target_challenge_id
  ), candidates as (
    select challenge_join.side, 1 as priority
    from public.challenge_joins challenge_join
    where challenge_join.challenge_id = target_challenge_id
      and challenge_join.user_id = target_user_id
      and challenge_join.role = 'Challenger'
      and challenge_join.side in ('Team A', 'Team B')
    union all
    select 'Team A', 2 from target where target.created_by = target_user_id
    union all
    select case when team.id = target.team_a_id then 'Team A' else 'Team B' end, 3
    from target
    join public.talent_teams team on team.id in (target.team_a_id, target.team_b_id)
    where team.owner_user_id = target_user_id
    union all
    select case when membership.team_id = target.team_a_id then 'Team A' else 'Team B' end, 4
    from target
    join public.team_join_requests membership on membership.team_id in (target.team_a_id, target.team_b_id)
    where membership.requester_user_id = target_user_id and membership.status = 'Accepted'
    union all
    select 'Team B', 5
    from public.challenge_invites invite
    where invite.challenge_id = target_challenge_id
      and invite.invited_user_id = target_user_id
      and invite.status = 'Accepted'
  )
  select side from candidates order by priority limit 1;
$$;

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
    when target_challenge.competition_mode = 'Ranked' then 5
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

create or replace function public.award_talent7_challenge_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  participant uuid;
begin
  if new.status <> 'Completed' or (tg_op = 'UPDATE' and old.status = 'Completed') then return new; end if;

  for participant in
    select new.created_by where new.created_by is not null
    union
    select user_id from public.challenge_joins
      where challenge_id = new.id and role = 'Challenger' and user_id is not null
    union
    select invited_user_id from public.challenge_invites
      where challenge_id = new.id and status = 'Accepted'
    union
    select owner_user_id from public.talent_teams
      where id in (new.team_a_id, new.team_b_id)
    union
    select requester_user_id from public.team_join_requests
      where team_id in (new.team_a_id, new.team_b_id) and status = 'Accepted'
  loop
    perform public.award_talent7_challenge(new.id, participant);
  end loop;
  return new;
end;
$$;

drop trigger if exists award_talent7_challenge_trigger on public.challenges;
create trigger award_talent7_challenge_trigger
after update of status on public.challenges
for each row execute function public.award_talent7_challenge_participants();

-- Shared helper used for late proof uploads and manual recovery.
create or replace function public.award_talent7_challenge_participants_for_id(target_challenge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_challenge public.challenges;
  participant uuid;
  awarded integer := 0;
begin
  select * into target_challenge from public.challenges where id = target_challenge_id;
  if target_challenge.id is null or target_challenge.status <> 'Completed' then return 0; end if;

  for participant in
    select target_challenge.created_by where target_challenge.created_by is not null
    union
    select user_id from public.challenge_joins
      where challenge_id = target_challenge.id and role = 'Challenger' and user_id is not null
    union
    select invited_user_id from public.challenge_invites
      where challenge_id = target_challenge.id and status = 'Accepted'
    union
    select owner_user_id from public.talent_teams
      where id in (target_challenge.team_a_id, target_challenge.team_b_id)
    union
    select requester_user_id from public.team_join_requests
      where team_id in (target_challenge.team_a_id, target_challenge.team_b_id) and status = 'Accepted'
  loop
    if public.award_talent7_challenge(target_challenge.id, participant) then awarded := awarded + 1; end if;
  end loop;
  return awarded;
end;
$$;

create or replace function public.award_talent7_after_proof()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_challenge public.challenges;
begin
  select * into target_challenge from public.challenges where id = new.challenge_id;
  if target_challenge.status = 'Completed' then
    perform public.award_talent7_challenge_participants_for_id(target_challenge.id);
  end if;
  return new;
end;
$$;

drop trigger if exists award_talent7_after_proof_trigger on public.proofs;
create trigger award_talent7_after_proof_trigger
after insert on public.proofs
for each row execute function public.award_talent7_after_proof();

create or replace function public.refresh_my_talent7_league()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_challenge_id uuid;
  awarded integer := 0;
begin
  if acting_user is null then raise exception 'Log in before refreshing Talent7 League progress'; end if;
  perform public.ensure_talent7_active_season();

  for target_challenge_id in
    select challenge.id
    from public.challenges challenge
    where challenge.status = 'Completed'
      and exists (select 1 from public.proofs where proofs.challenge_id = challenge.id)
      and public.talent7_challenge_side_for_user(challenge.id, acting_user) is not null
  loop
    if public.award_talent7_challenge(target_challenge_id, acting_user) then awarded := awarded + 1; end if;
  end loop;
  return awarded;
end;
$$;

revoke all on function public.talent7_tier_for_points(integer) from public;
revoke all on function public.ensure_talent7_active_season() from public;
revoke all on function public.talent7_challenge_side_for_user(uuid, uuid) from public;
revoke all on function public.award_talent7_challenge(uuid, uuid) from public;
revoke all on function public.award_talent7_challenge_participants() from public;
revoke all on function public.award_talent7_challenge_participants_for_id(uuid) from public;
revoke all on function public.award_talent7_after_proof() from public;
revoke all on function public.refresh_my_talent7_league() from public;
grant execute on function public.refresh_my_talent7_league() to authenticated;

select public.ensure_talent7_active_season();
