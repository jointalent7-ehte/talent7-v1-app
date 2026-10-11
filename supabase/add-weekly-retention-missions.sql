-- Three transparent weekly missions that work even when a friend is not online.
-- Run after add-local-match-discovery.sql. Rewards are seasonal XP only, never Rank Points.

begin;

create table if not exists public.talent7_weekly_mission_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  xp_awarded integer not null default 30 check (xp_awarded = 30),
  completed_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists talent7_weekly_mission_claims_user_idx
on public.talent7_weekly_mission_claims (user_id, week_start desc);

alter table public.talent7_weekly_mission_claims enable row level security;
revoke all on public.talent7_weekly_mission_claims from public, anon, authenticated;
grant select on public.talent7_weekly_mission_claims to authenticated;

drop policy if exists "Users read their own weekly mission claims"
on public.talent7_weekly_mission_claims;
create policy "Users read their own weekly mission claims"
on public.talent7_weekly_mission_claims for select to authenticated
using (auth.uid() = user_id);

create or replace function public.get_my_weekly_missions()
returns table (
  mission_key text,
  title text,
  detail text,
  progress integer,
  target integer,
  completed boolean,
  week_start date,
  week_ends_at timestamptz,
  reward_claimed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  current_week date := current_date - (extract(isodow from current_date)::integer - 1);
  next_week timestamptz;
  proof_progress integer := 0;
  benchmark_progress integer := 0;
  reaction_progress integer := 0;
  target_season public.talent7_seasons;
  inserted_claims integer := 0;
  has_claim boolean := false;
begin
  if acting_user is null then
    raise exception 'Sign in to open weekly missions.';
  end if;

  next_week := (current_week + 7)::timestamptz;

  select count(*)::integer into proof_progress
  from public.talent7_reward_events reward
  where reward.user_id = acting_user
    and reward.proof_bonus = true
    and reward.created_at >= current_week::timestamptz
    and reward.created_at < next_week;

  select count(*)::integer into benchmark_progress
  from public.talent7_benchmark_attempts attempt
  where attempt.user_id = acting_user
    and attempt.created_at >= current_week::timestamptz
    and attempt.created_at < next_week;

  select count(*)::integer into reaction_progress
  from public.talent7_benchmark_feed_reactions reaction
  where reaction.user_id = acting_user
    and reaction.created_at >= current_week::timestamptz
    and reaction.created_at < next_week;

  select * into target_season
  from public.talent7_seasons season
  where season.status = 'Active'
    and now() >= season.starts_at
    and now() < season.ends_at
  order by season.starts_at desc
  limit 1;

  if proof_progress >= 1
    and benchmark_progress >= 1
    and reaction_progress >= 2
    and target_season.id is not null
  then
    insert into public.talent7_weekly_mission_claims (
      user_id, week_start, season_id, xp_awarded
    ) values (
      acting_user, current_week, target_season.id, 30
    )
    on conflict (user_id, week_start) do nothing;

    get diagnostics inserted_claims = row_count;

    if inserted_claims = 1 then
      insert into public.talent7_rank_profiles (
        season_id, user_id, xp, rank_points, tier, completed_count, wins, losses
      ) values (
        target_season.id, acting_user, 30, 0, 'Rookie', 0, 0, 0
      )
      on conflict (season_id, user_id) do update
      set xp = talent7_rank_profiles.xp + 30,
          updated_at = now();

      insert into public.talent7_trophies (
        user_id, trophy_key, title, detail, rarity, icon_key
      ) values (
        acting_user,
        'first-weekly-mission-set',
        'Weekly Finisher',
        'Completed all three Talent7 weekly missions for the first time.',
        'Common',
        'weekly-missions'
      )
      on conflict (user_id, trophy_key) do nothing;
    end if;
  end if;

  select exists (
    select 1
    from public.talent7_weekly_mission_claims claim
    where claim.user_id = acting_user
      and claim.week_start = current_week
  ) into has_claim;

  return query
  select *
  from (values
    (
      'proof-finish'::text,
      'Prove it'::text,
      'Complete one challenge with your own saved proof.'::text,
      least(proof_progress, 1),
      1,
      proof_progress >= 1,
      current_week,
      next_week,
      has_claim
    ),
    (
      'benchmark'::text,
      'Set a benchmark'::text,
      'Record one official solo benchmark attempt.'::text,
      least(benchmark_progress, 1),
      1,
      benchmark_progress >= 1,
      current_week,
      next_week,
      has_claim
    ),
    (
      'community-support'::text,
      'Support the field'::text,
      'React positively to two verified community benchmark videos.'::text,
      least(reaction_progress, 2),
      2,
      reaction_progress >= 2,
      current_week,
      next_week,
      has_claim
    )
  ) as missions(
    mission_key, title, detail, progress, target, completed,
    week_start, week_ends_at, reward_claimed
  );
end;
$$;

revoke all on function public.get_my_weekly_missions() from public, anon;
grant execute on function public.get_my_weekly_missions() to authenticated;

comment on table public.talent7_weekly_mission_claims is
  'Idempotent once-per-week seasonal XP claims for completing the transparent weekly mission set. Claims never award Rank Points or affect results.';

commit;
