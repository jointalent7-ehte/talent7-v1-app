-- Permanent activity-mastery titles backed by participant proof or verified benchmarks.
-- Run after add-benchmark-spectator-feed.sql.

begin;

create or replace function public.refresh_activity_mastery_titles_for_user(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mastery record;
  trophy_total integer := 0;
begin
  if target_user_id is null then
    return 0;
  end if;

  for mastery in
    with proof_activities as (
      select trim(reward.activity) as activity
      from public.talent7_reward_events reward
      where reward.user_id = target_user_id
        and reward.proof_bonus = true

      union all

      select trim(benchmark.activity) as activity
      from public.talent7_benchmark_attempts attempt
      join public.talent7_benchmarks benchmark on benchmark.id = attempt.benchmark_id
      where attempt.user_id = target_user_id
        and attempt.verification_status = 'Verified'
    ),
    categorized as (
      select
        case
          when lower(activity) ~ '(push[ -]?ups?|press[ -]?ups?)' then 'push-ups'
          when lower(activity) ~ 'squats?' then 'squats'
          when lower(activity) ~ 'planks?' then 'plank'
          when lower(activity) ~ 'burpees?' then 'burpees'
          when lower(activity) ~ '(^|[^a-z])(run|runs|running|sprint|sprints|marathon|marathons|jog|jogging)([^a-z]|$)' then 'running'
          when lower(activity) ~ '(swimming|swim)' then 'swimming'
          when lower(activity) ~ 'badminton' then 'badminton'
          when lower(activity) ~ '(table[ -]?tennis|ping[ -]?pong)' then 'table-tennis'
          else 'other-' || md5(lower(activity))
        end as activity_key,
        case
          when lower(activity) ~ '(push[ -]?ups?|press[ -]?ups?)' then 'Push-ups'
          when lower(activity) ~ 'squats?' then 'Squats'
          when lower(activity) ~ 'planks?' then 'Plank'
          when lower(activity) ~ 'burpees?' then 'Burpees'
          when lower(activity) ~ '(^|[^a-z])(run|runs|running|sprint|sprints|marathon|marathons|jog|jogging)([^a-z]|$)' then 'Running'
          when lower(activity) ~ '(swimming|swim)' then 'Swimming'
          when lower(activity) ~ 'badminton' then 'Badminton'
          when lower(activity) ~ '(table[ -]?tennis|ping[ -]?pong)' then 'Table tennis'
          else initcap(activity)
        end as activity_label
      from proof_activities
      where nullif(trim(activity), '') is not null
    ),
    activity_counts as (
      select activity_key, max(activity_label) as activity_label, count(*)::integer as proof_count
      from categorized
      group by activity_key
    ),
    milestones(activity_key, threshold, title, detail, rarity, icon_key) as (
      values
        ('push-ups', 1, 'First Rep', 'Completed the first proof-backed Push-ups performance.', 'Common', 'mastery-push-ups'),
        ('push-ups', 5, 'Iron Lungs', 'Completed five proof-backed Push-ups performances.', 'Rare', 'mastery-push-ups'),
        ('push-ups', 15, 'Rep Machine', 'Completed fifteen proof-backed Push-ups performances.', 'Epic', 'mastery-push-ups'),
        ('squats', 1, 'Depth Checked', 'Completed the first proof-backed Squats performance.', 'Common', 'mastery-squats'),
        ('squats', 5, 'Steel Legs', 'Completed five proof-backed Squats performances.', 'Rare', 'mastery-squats'),
        ('squats', 15, 'Squat Engine', 'Completed fifteen proof-backed Squats performances.', 'Epic', 'mastery-squats'),
        ('plank', 1, 'Hold the Line', 'Completed the first proof-backed Plank performance.', 'Common', 'mastery-plank'),
        ('plank', 5, 'Core Fortress', 'Completed five proof-backed Plank performances.', 'Rare', 'mastery-plank'),
        ('plank', 15, 'Unshaken', 'Completed fifteen proof-backed Plank performances.', 'Epic', 'mastery-plank'),
        ('burpees', 1, 'Full Send', 'Completed the first proof-backed Burpees performance.', 'Common', 'mastery-burpees'),
        ('burpees', 5, 'Burpee Engine', 'Completed five proof-backed Burpees performances.', 'Rare', 'mastery-burpees'),
        ('burpees', 15, 'Relentless', 'Completed fifteen proof-backed Burpees performances.', 'Epic', 'mastery-burpees'),
        ('running', 1, 'First Stride', 'Completed the first proof-backed Running performance.', 'Common', 'mastery-running'),
        ('running', 5, 'Road Tested', 'Completed five proof-backed Running performances.', 'Rare', 'mastery-running'),
        ('running', 15, 'Distance Maker', 'Completed fifteen proof-backed Running performances.', 'Epic', 'mastery-running'),
        ('swimming', 1, 'First Splash', 'Completed the first proof-backed Swimming performance.', 'Common', 'mastery-swimming'),
        ('swimming', 5, 'Strong Current', 'Completed five proof-backed Swimming performances.', 'Rare', 'mastery-swimming'),
        ('swimming', 15, 'Lane Leader', 'Completed fifteen proof-backed Swimming performances.', 'Epic', 'mastery-swimming'),
        ('badminton', 1, 'First Rally', 'Completed the first proof-backed Badminton performance.', 'Common', 'mastery-badminton'),
        ('badminton', 5, 'Rally Ready', 'Completed five proof-backed Badminton performances.', 'Rare', 'mastery-badminton'),
        ('badminton', 15, 'Court Commander', 'Completed fifteen proof-backed Badminton performances.', 'Epic', 'mastery-badminton'),
        ('table-tennis', 1, 'First Serve', 'Completed the first proof-backed Table tennis performance.', 'Common', 'mastery-table-tennis'),
        ('table-tennis', 5, 'Spin Specialist', 'Completed five proof-backed Table tennis performances.', 'Rare', 'mastery-table-tennis'),
        ('table-tennis', 15, 'Table Ace', 'Completed fifteen proof-backed Table tennis performances.', 'Epic', 'mastery-table-tennis')
    ),
    unlocked as (
      select
        counts.activity_key,
        milestone.threshold,
        milestone.title,
        milestone.detail,
        milestone.rarity,
        milestone.icon_key
      from activity_counts counts
      join milestones milestone on milestone.activity_key = counts.activity_key
      where counts.proof_count >= milestone.threshold

      union all

      select
        counts.activity_key,
        5,
        left(counts.activity_label, 82) || ' Specialist',
        'Completed five proof-backed ' || left(counts.activity_label, 170) || ' performances.',
        'Rare',
        'mastery-activity'
      from activity_counts counts
      where counts.activity_key like 'other-%'
        and counts.proof_count >= 5
    )
    select * from unlocked
  loop
    insert into public.talent7_trophies (
      user_id,
      trophy_key,
      title,
      detail,
      rarity,
      icon_key
    ) values (
      target_user_id,
      'mastery-' || mastery.activity_key || '-' || mastery.threshold::text,
      mastery.title,
      mastery.detail,
      mastery.rarity,
      mastery.icon_key
    )
    on conflict (user_id, trophy_key) do nothing;
  end loop;

  select count(*)::integer
  into trophy_total
  from public.talent7_trophies trophy
  where trophy.user_id = target_user_id
    and trophy.trophy_key like 'mastery-%';

  return trophy_total;
end;
$$;

create or replace function public.refresh_my_activity_mastery_titles()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Sign in to refresh activity mastery titles.';
  end if;

  return public.refresh_activity_mastery_titles_for_user(viewer_id);
end;
$$;

create or replace function public.refresh_activity_mastery_after_reward()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.proof_bonus = true then
    perform public.refresh_activity_mastery_titles_for_user(new.user_id);
  end if;
  return new;
end;
$$;

create or replace function public.refresh_activity_mastery_after_benchmark_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.verification_status <> 'Verified' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.refresh_activity_mastery_titles_for_user(new.user_id);
  elsif old.verification_status is distinct from new.verification_status then
    perform public.refresh_activity_mastery_titles_for_user(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_activity_mastery_after_reward_trigger
on public.talent7_reward_events;
create trigger refresh_activity_mastery_after_reward_trigger
after insert on public.talent7_reward_events
for each row execute function public.refresh_activity_mastery_after_reward();

drop trigger if exists refresh_activity_mastery_after_benchmark_trigger
on public.talent7_benchmark_attempts;
create trigger refresh_activity_mastery_after_benchmark_trigger
after insert or update of verification_status on public.talent7_benchmark_attempts
for each row execute function public.refresh_activity_mastery_after_benchmark_verification();

revoke all on function public.refresh_activity_mastery_titles_for_user(uuid) from public, anon, authenticated;
revoke all on function public.refresh_activity_mastery_after_reward() from public, anon, authenticated;
revoke all on function public.refresh_activity_mastery_after_benchmark_verification() from public, anon, authenticated;
revoke all on function public.refresh_my_activity_mastery_titles() from public, anon;
grant execute on function public.refresh_my_activity_mastery_titles() to authenticated;

do $$
declare
  target_user record;
begin
  for target_user in
    select distinct user_id
    from (
      select reward.user_id
      from public.talent7_reward_events reward
      where reward.proof_bonus = true
      union
      select attempt.user_id
      from public.talent7_benchmark_attempts attempt
      where attempt.verification_status = 'Verified'
    ) proof_users
  loop
    perform public.refresh_activity_mastery_titles_for_user(target_user.user_id);
  end loop;
end;
$$;

comment on function public.refresh_my_activity_mastery_titles() is
  'Unlocks permanent cosmetic activity titles from personal proof-backed completions and administrator-verified benchmarks. It never changes XP, Rank Points, prizes, or official results.';

commit;
