create extension if not exists "uuid-ossp";

alter table public.profiles
add column if not exists ready_now_until timestamptz;

create index if not exists profiles_ready_now_idx
on public.profiles (ready_now_until desc)
where ready_now_until is not null;

create or replace function public.set_my_ready_now(target_minutes integer default 60)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  next_ready_until timestamptz;
begin
  if acting_user is null then
    raise exception 'Log in before changing Ready Now';
  end if;

  if target_minutes <= 0 then
    next_ready_until := null;
  else
    next_ready_until := now() + make_interval(mins => least(greatest(target_minutes, 15), 120));
  end if;

  update public.profiles
  set ready_now_until = next_ready_until,
      updated_at = now()
  where user_id = acting_user;

  if not found then
    raise exception 'Create your Talent7 profile first';
  end if;

  return next_ready_until;
end;
$$;

revoke all on function public.set_my_ready_now(integer) from public;
grant execute on function public.set_my_ready_now(integer) to authenticated;

create table if not exists public.growth_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text check (anonymous_id is null or char_length(anonymous_id) between 8 and 80),
  event_name text not null check (event_name in (
    'shared_link_view', 'shared_return', 'signup', 'login', 'invite_created',
    'invite_accepted', 'challenge_completed', 'result_shared', 'league_joined'
  )),
  resource_type text check (resource_type is null or char_length(resource_type) <= 40),
  resource_token text check (resource_token is null or char_length(resource_token) <= 120),
  source text check (source is null or char_length(source) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists growth_events_name_created_idx
on public.growth_events (event_name, created_at desc);

create index if not exists growth_events_user_created_idx
on public.growth_events (user_id, created_at desc)
where user_id is not null;

alter table public.growth_events enable row level security;
revoke all on public.growth_events from anon, authenticated;

create or replace function public.track_growth_event(
  target_event_name text,
  target_anonymous_id text default null,
  target_resource_type text default null,
  target_resource_token text default null,
  target_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id uuid;
begin
  if target_event_name not in (
    'shared_link_view', 'shared_return', 'signup', 'login', 'result_shared', 'league_joined'
  ) then
    raise exception 'Unsupported client growth event';
  end if;

  insert into public.growth_events (
    user_id,
    anonymous_id,
    event_name,
    resource_type,
    resource_token,
    source
  ) values (
    auth.uid(),
    nullif(left(coalesce(target_anonymous_id, ''), 80), ''),
    target_event_name,
    nullif(left(coalesce(target_resource_type, ''), 40), ''),
    nullif(left(coalesce(target_resource_token, ''), 120), ''),
    nullif(left(coalesce(target_source, ''), 120), '')
  ) returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.track_growth_event(text, text, text, text, text) from public;
grant execute on function public.track_growth_event(text, text, text, text, text) to anon, authenticated;

create or replace function public.get_growth_funnel(target_days integer default 30)
returns table(event_name text, event_count bigint, unique_visitors bigint, authenticated_users bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_admins where user_id = auth.uid()
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select growth.event_name,
         count(*) as event_count,
         count(distinct coalesce(growth.user_id::text, growth.anonymous_id)) as unique_visitors,
         count(distinct growth.user_id) as authenticated_users
  from public.growth_events growth
  where growth.created_at >= now() - make_interval(days => least(greatest(target_days, 1), 365))
  group by growth.event_name
  order by event_count desc, growth.event_name;
end;
$$;

revoke all on function public.get_growth_funnel(integer) from public;
grant execute on function public.get_growth_funnel(integer) to authenticated;

create or replace function public.record_challenge_growth_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'challenge_invites' then
    if tg_op = 'INSERT' then
      insert into public.growth_events (user_id, event_name, resource_type, resource_token, source)
      values (new.from_user_id, 'invite_created', 'challenge_invite', new.id::text, 'database');
    elsif new.status = 'Accepted' and old.status is distinct from new.status then
      insert into public.growth_events (user_id, event_name, resource_type, resource_token, source)
      values (new.invited_user_id, 'invite_accepted', 'challenge_invite', new.id::text, 'database');
    end if;
  elsif tg_table_name = 'challenges' and new.status = 'Completed' and old.status is distinct from new.status then
    insert into public.growth_events (user_id, event_name, resource_type, resource_token, source)
    values (coalesce(new.completed_by, new.created_by), 'challenge_completed', 'challenge', new.id::text, 'database');
  end if;

  return new;
end;
$$;

drop trigger if exists record_invite_growth_trigger on public.challenge_invites;
create trigger record_invite_growth_trigger
after insert or update of status on public.challenge_invites
for each row execute function public.record_challenge_growth_event();

drop trigger if exists record_completion_growth_trigger on public.challenges;
create trigger record_completion_growth_trigger
after update of status on public.challenges
for each row execute function public.record_challenge_growth_event();

revoke all on function public.record_challenge_growth_event() from public;

create table if not exists public.user_achievements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null check (char_length(achievement_key) between 2 and 60),
  title text not null check (char_length(title) between 2 and 80),
  detail text not null check (char_length(detail) between 2 and 180),
  achieved_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_idx
on public.user_achievements (user_id, achieved_at desc);

alter table public.user_achievements enable row level security;
revoke all on public.user_achievements from anon, authenticated;
grant select on public.user_achievements to authenticated;

drop policy if exists "Authenticated users read achievements" on public.user_achievements;
create policy "Authenticated users read achievements"
on public.user_achievements for select
to authenticated
using (true);

create or replace function public.refresh_my_achievements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  unlocked integer := 0;
begin
  if acting_user is null then
    raise exception 'Log in before refreshing achievements';
  end if;

  if exists (select 1 from public.challenges where created_by = acting_user) then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'first_challenge', 'Challenge starter', 'Created your first Talent7 challenge room.')
    on conflict do nothing;
  end if;

  if exists (select 1 from public.proofs where user_id = acting_user) then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'first_proof', 'Proof ready', 'Uploaded proof to a challenge room.')
    on conflict do nothing;
  end if;

  if (select count(*) from public.challenges where created_by = acting_user) >= 5 then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'five_challenges', 'Five-room streak', 'Created five Talent7 challenge rooms.')
    on conflict do nothing;
  end if;

  if exists (select 1 from public.votes where user_id = acting_user) then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'first_vote', 'Community voice', 'Cast your first challenge vote.')
    on conflict do nothing;
  end if;

  if exists (select 1 from public.talent_teams where owner_user_id = acting_user) then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'team_captain', 'Team captain', 'Created and now lead a Talent7 team.')
    on conflict do nothing;
  end if;

  if (select count(*) from public.profile_follows where follower_id = acting_user) >= 5 then
    insert into public.user_achievements (user_id, achievement_key, title, detail)
    values (acting_user, 'five_follows', 'Circle builder', 'Followed five Talent7 profiles.')
    on conflict do nothing;
  end if;

  select count(*) into unlocked from public.user_achievements where user_id = acting_user;
  return unlocked;
end;
$$;

revoke all on function public.refresh_my_achievements() from public;
grant execute on function public.refresh_my_achievements() to authenticated;

create table if not exists public.weekly_leagues (
  id uuid primary key default uuid_generate_v4(),
  week_start date not null,
  activity text not null check (char_length(activity) between 2 and 80),
  activity_key text not null check (char_length(activity_key) between 2 and 80),
  title text not null check (char_length(title) between 2 and 100),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at timestamptz not null default now(),
  unique (week_start, activity_key)
);

create table if not exists public.weekly_league_entries (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references public.weekly_leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_count integer not null default 0 check (completed_count >= 0),
  proof_count integer not null default 0 check (proof_count >= 0),
  vote_count integer not null default 0 check (vote_count >= 0),
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index if not exists weekly_league_entries_rank_idx
on public.weekly_league_entries (league_id, score desc, updated_at);

alter table public.weekly_leagues enable row level security;
alter table public.weekly_league_entries enable row level security;
revoke all on public.weekly_leagues from anon, authenticated;
revoke all on public.weekly_league_entries from anon, authenticated;
grant select on public.weekly_leagues, public.weekly_league_entries to authenticated;

drop policy if exists "Authenticated users read weekly leagues" on public.weekly_leagues;
create policy "Authenticated users read weekly leagues"
on public.weekly_leagues for select to authenticated using (true);

drop policy if exists "Authenticated users read weekly league entries" on public.weekly_league_entries;
create policy "Authenticated users read weekly league entries"
on public.weekly_league_entries for select to authenticated using (true);

create or replace function public.join_weekly_league(target_activity text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  current_week date := date_trunc('week', now())::date;
  clean_activity text := left(btrim(target_activity), 80);
  target_league_id uuid;
begin
  if acting_user is null then
    raise exception 'Log in before joining a weekly league';
  end if;
  if char_length(clean_activity) < 2 then
    raise exception 'Choose an activity first';
  end if;

  insert into public.weekly_leagues (week_start, activity, activity_key, title)
  values (current_week, clean_activity, lower(clean_activity), clean_activity || ' weekly league')
  on conflict (week_start, activity_key) do update set activity = excluded.activity
  returning id into target_league_id;

  insert into public.weekly_league_entries (league_id, user_id)
  values (target_league_id, acting_user)
  on conflict (league_id, user_id) do nothing;

  insert into public.growth_events (user_id, event_name, resource_type, resource_token, source)
  values (acting_user, 'league_joined', 'weekly_league', target_league_id::text, 'database');

  return target_league_id;
end;
$$;

create or replace function public.refresh_my_weekly_league_scores()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  changed integer := 0;
begin
  if acting_user is null then
    raise exception 'Log in before refreshing league scores';
  end if;

  update public.weekly_league_entries entry
  set completed_count = totals.completed_count,
      proof_count = totals.proof_count,
      vote_count = totals.vote_count,
      score = totals.completed_count * 10 + totals.proof_count * 3 + totals.vote_count,
      updated_at = now()
  from public.weekly_leagues league
  cross join lateral (
    select
      (
        select count(distinct challenge.id)::integer
        from public.challenges challenge
        where challenge.status = 'Completed'
          and coalesce(challenge.completed_at, challenge.created_at) >= league.week_start
          and coalesce(challenge.completed_at, challenge.created_at) < league.week_start + interval '7 days'
          and lower(coalesce(challenge.sport_type, challenge.title)) = league.activity_key
          and (
            challenge.created_by = acting_user
            or exists (select 1 from public.challenge_joins join_row where join_row.challenge_id = challenge.id and join_row.user_id = acting_user)
            or exists (select 1 from public.challenge_invites invite where invite.challenge_id = challenge.id and invite.invited_user_id = acting_user and invite.status = 'Accepted')
          )
      ) as completed_count,
      (
        select count(*)::integer
        from public.proofs proof
        join public.challenges challenge on challenge.id = proof.challenge_id
        where proof.user_id = acting_user
          and proof.created_at >= league.week_start
          and proof.created_at < league.week_start + interval '7 days'
          and lower(coalesce(challenge.sport_type, challenge.title)) = league.activity_key
      ) as proof_count,
      (
        select count(*)::integer
        from public.votes vote
        join public.challenges challenge on challenge.id = vote.challenge_id
        where vote.user_id = acting_user
          and vote.created_at >= league.week_start
          and vote.created_at < league.week_start + interval '7 days'
          and lower(coalesce(challenge.sport_type, challenge.title)) = league.activity_key
      ) as vote_count
  ) totals
  where entry.league_id = league.id
    and entry.user_id = acting_user;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.join_weekly_league(text) from public;
revoke all on function public.refresh_my_weekly_league_scores() from public;
grant execute on function public.join_weekly_league(text) to authenticated;
grant execute on function public.refresh_my_weekly_league_scores() to authenticated;

alter table public.notification_preferences
add column if not exists weekly_summary boolean not null default true;

alter table public.push_notification_events
drop constraint if exists push_notification_events_category_check;

alter table public.push_notification_events
add constraint push_notification_events_category_check check (
  category in ('Challenge invite', 'Challenge update', 'Live room', 'Voting', 'Proof and result', 'Social', 'Weekly summary')
);

create table if not exists public.weekly_summary_deliveries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  push_event_id uuid references public.push_notification_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_summary_deliveries enable row level security;
revoke all on public.weekly_summary_deliveries from anon, authenticated;

create or replace function public.queue_weekly_activity_summaries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  summary_week date := (date_trunc('week', now()) - interval '7 days')::date;
  recipient record;
  event_id uuid;
  queued integer := 0;
begin
  for recipient in
    select profile.user_id,
           profile.display_name,
           (select count(*) from public.challenges where created_by = profile.user_id and created_at >= summary_week and created_at < summary_week + 7) as created_count,
           (select count(*) from public.proofs where user_id = profile.user_id and created_at >= summary_week and created_at < summary_week + 7) as proof_count,
           (select count(*) from public.votes where user_id = profile.user_id and created_at >= summary_week and created_at < summary_week + 7) as vote_count
    from public.profiles profile
    left join public.notification_preferences preference on preference.user_id = profile.user_id
    where coalesce(preference.push_enabled, true)
      and coalesce(preference.weekly_summary, true)
      and not exists (
        select 1 from public.weekly_summary_deliveries delivery
        where delivery.user_id = profile.user_id and delivery.week_start = summary_week
      )
  loop
    event_id := public.enqueue_push_notification(
      recipient.user_id,
      null,
      'Weekly summary',
      'Your Talent7 week',
      recipient.created_count || ' challenges created, ' || recipient.proof_count || ' proofs and ' || recipient.vote_count || ' votes last week.',
      '#my-talent7',
      'weekly_summary',
      null
    );

    insert into public.weekly_summary_deliveries (user_id, week_start, push_event_id)
    values (recipient.user_id, summary_week, event_id)
    on conflict do nothing;
    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke all on function public.queue_weekly_activity_summaries() from public;

comment on function public.queue_weekly_activity_summaries() is
  'Idempotently queues one Firebase-backed activity summary per opted-in user for the previous calendar week.';
