-- Admin-only aggregate funnel for measuring whether new members reach useful actions.
-- No member identities or row-level activity are returned.
-- Run after add-city-density-discovery-gate.sql.

begin;

create or replace function public.get_talent7_cold_start_funnel(target_days integer default 30)
returns table (
  stage_order integer,
  stage_key text,
  stage_title text,
  user_count bigint,
  cohort_percent numeric
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  safe_days integer := least(greatest(coalesce(target_days, 30), 1), 365);
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins admin where admin.user_id = acting_user
  ) then
    raise exception 'Talent7 admin access required';
  end if;

  return query
  with cohort as (
    select account.id, account.created_at, account.last_sign_in_at
    from auth.users account
    where account.created_at >= now() - make_interval(days => safe_days)
  ),
  profile_users as (
    select distinct profile.user_id
    from public.profiles profile
    join cohort on cohort.id = profile.user_id
  ),
  benchmark_users as (
    select distinct attempt.user_id
    from public.talent7_benchmark_attempts attempt
    join cohort on cohort.id = attempt.user_id
  ),
  queue_users as (
    select distinct request.user_id
    from public.talent7_match_requests request
    join cohort on cohort.id = request.user_id
  ),
  challenge_users as (
    select challenge.created_by as user_id
    from public.challenges challenge
    join cohort on cohort.id = challenge.created_by
    union
    select challenge_join.user_id
    from public.challenge_joins challenge_join
    join cohort on cohort.id = challenge_join.user_id
    where challenge_join.user_id is not null
    union
    select invite.invited_user_id
    from public.challenge_invites invite
    join cohort on cohort.id = invite.invited_user_id
    where invite.status = 'Accepted'
  ),
  first_action_users as (
    select user_id from benchmark_users
    union select user_id from queue_users
    union select user_id from challenge_users
  ),
  completed_users as (
    select distinct reward.user_id
    from public.talent7_reward_events reward
    join cohort on cohort.id = reward.user_id
  ),
  counts as (
    select
      (select count(*) from cohort)::bigint as cohort_count,
      (select count(*) from profile_users)::bigint as profile_count,
      (select count(*) from first_action_users)::bigint as first_action_count,
      (select count(*) from benchmark_users)::bigint as benchmark_count,
      (select count(*) from queue_users)::bigint as queue_count,
      (select count(*) from challenge_users)::bigint as challenge_count,
      (select count(*) from completed_users)::bigint as completed_count,
      (select count(*) from cohort where last_sign_in_at >= created_at + interval '1 day')::bigint as returned_count
  ),
  stages(stage_order, stage_key, stage_title, user_count) as (
    select 1, 'account', 'Accounts created', cohort_count from counts
    union all select 2, 'profile', 'Profiles completed', profile_count from counts
    union all select 3, 'first_action', 'Reached a useful action', first_action_count from counts
    union all select 4, 'benchmark', 'Saved a benchmark', benchmark_count from counts
    union all select 5, 'matchmaking', 'Entered matchmaking', queue_count from counts
    union all select 6, 'challenge', 'Created or joined a challenge', challenge_count from counts
    union all select 7, 'completed', 'Proof-backed challenge finish', completed_count from counts
    union all select 8, 'returned', 'Returned after the first day', returned_count from counts
  )
  select
    stages.stage_order::integer,
    stages.stage_key::text,
    stages.stage_title::text,
    stages.user_count::bigint,
    case
      when counts.cohort_count = 0 then 0::numeric
      else round((stages.user_count::numeric / counts.cohort_count::numeric) * 100, 1)
    end
  from stages
  cross join counts
  order by stages.stage_order;
end;
$$;

revoke all on function public.get_talent7_cold_start_funnel(integer) from public, anon;
grant execute on function public.get_talent7_cold_start_funnel(integer) to authenticated;

comment on function public.get_talent7_cold_start_funnel(integer) is
  'Admin-only aggregate activation and return funnel for recently created accounts. It returns counts and percentages only, never member identities.';

commit;
