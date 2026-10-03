-- Talent7 Challenge Now: immediate solo benchmarks and safe individual matchmaking.
-- Run after add-sponsored-tournament-prizes.sql.

begin;

create table if not exists public.talent7_benchmarks (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  activity text not null,
  summary text not null,
  rules text not null,
  metric_label text not null,
  unit text not null,
  target_value numeric,
  duration_seconds integer,
  score_direction text not null default 'Higher'
    check (score_direction in ('Higher', 'Lower')),
  status text not null default 'Active'
    check (status in ('Draft', 'Active', 'Retired')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent7_benchmark_attempts (
  id uuid primary key default uuid_generate_v4(),
  benchmark_id uuid not null references public.talent7_benchmarks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric not null check (score > 0 and score <= 1000000),
  note text,
  verification_status text not null default 'Self reported'
    check (verification_status in ('Self reported', 'Proof submitted', 'Verified', 'Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (note is null or char_length(note) <= 240)
);

create index if not exists talent7_benchmark_attempts_user_idx
on public.talent7_benchmark_attempts (user_id, benchmark_id, created_at desc);

create table if not exists public.talent7_match_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  activity text not null,
  skill_level text not null default 'Open'
    check (skill_level in ('Open', 'Beginner', 'Intermediate', 'Advanced', 'Pro')),
  play_mode text not null default 'Either'
    check (play_mode in ('Either', 'In person', 'Online')),
  match_format text not null default 'Any'
    check (match_format in ('Any', 'Singles', 'Doubles', 'Team')),
  region text not null default 'Global',
  note text,
  status text not null default 'Waiting'
    check (status in ('Waiting', 'Matched', 'Withdrawn', 'Expired')),
  matched_request_id uuid references public.talent7_match_requests(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(activity) between 2 and 100),
  check (char_length(display_name) between 1 and 80),
  check (char_length(region) between 1 and 100),
  check (note is null or char_length(note) <= 180),
  check (matched_request_id is null or matched_request_id <> id)
);

create unique index if not exists talent7_match_requests_one_active_activity
on public.talent7_match_requests (user_id, lower(activity))
where status in ('Waiting', 'Matched');

create index if not exists talent7_match_requests_waiting_idx
on public.talent7_match_requests (lower(activity), status, created_at)
where status = 'Waiting';

alter table public.talent7_benchmarks enable row level security;
alter table public.talent7_benchmark_attempts enable row level security;
alter table public.talent7_match_requests enable row level security;

revoke all on public.talent7_benchmarks from anon, authenticated;
revoke all on public.talent7_benchmark_attempts from anon, authenticated;
revoke all on public.talent7_match_requests from anon, authenticated;

grant select on public.talent7_benchmarks to anon, authenticated;
grant select on public.talent7_benchmark_attempts to authenticated;

drop policy if exists "Everyone reads active Talent7 benchmarks" on public.talent7_benchmarks;
create policy "Everyone reads active Talent7 benchmarks"
on public.talent7_benchmarks for select
using (
  status = 'Active'
  or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
);

drop policy if exists "Users read their own benchmark attempts" on public.talent7_benchmark_attempts;
create policy "Users read their own benchmark attempts"
on public.talent7_benchmark_attempts for select to authenticated
using (auth.uid() = user_id);

insert into public.talent7_benchmarks (
  slug, title, activity, summary, rules, metric_label, unit,
  target_value, duration_seconds, score_direction, sort_order
) values
  (
    'push-ups-60',
    '60-second push-up benchmark',
    'Push-up challenge',
    'Set a personal best now, then leave the challenge open for a future rival.',
    'Use a stable side view. Keep a straight body line, lower with control, and reach full arm extension. Count only strict repetitions completed inside 60 seconds.',
    'Strict repetitions',
    'reps',
    20,
    60,
    'Higher',
    10
  ),
  (
    'bodyweight-squats-60',
    '60-second squat benchmark',
    'Bodyweight squat challenge',
    'Record a repeatable fitness baseline without waiting for another person.',
    'Keep the full body visible. Reach a consistent legal depth, stand to full extension, and count only controlled repetitions completed inside 60 seconds.',
    'Controlled repetitions',
    'reps',
    30,
    60,
    'Higher',
    20
  ),
  (
    'plank-hold',
    'Strict plank hold',
    'Plank hold',
    'Build a personal record that another challenger can answer asynchronously.',
    'Keep shoulders, hips, and heels aligned. Stop the timer when the legal position is lost. Enter the completed hold time in seconds.',
    'Hold time',
    'seconds',
    60,
    null,
    'Higher',
    30
  ),
  (
    'burpees-60',
    '60-second burpee benchmark',
    'Burpee challenge',
    'Complete an official Talent7 starter test and invite someone to beat it later.',
    'Keep the full body visible. Use the same agreed movement standard for every repetition and count only complete repetitions inside 60 seconds.',
    'Complete repetitions',
    'reps',
    12,
    60,
    'Higher',
    40
  )
on conflict (slug) do update set
  title = excluded.title,
  activity = excluded.activity,
  summary = excluded.summary,
  rules = excluded.rules,
  metric_label = excluded.metric_label,
  unit = excluded.unit,
  target_value = excluded.target_value,
  duration_seconds = excluded.duration_seconds,
  score_direction = excluded.score_direction,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function public.record_talent7_benchmark_attempt(
  target_benchmark_id uuid,
  target_score numeric,
  target_note text default null
)
returns public.talent7_benchmark_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_benchmark public.talent7_benchmarks;
  saved_attempt public.talent7_benchmark_attempts;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  if target_score is null or target_score <= 0 or target_score > 1000000 then
    raise exception 'Enter a valid positive result';
  end if;
  if char_length(coalesce(target_note, '')) > 240 then
    raise exception 'Keep the attempt note under 240 characters';
  end if;

  select * into target_benchmark
  from public.talent7_benchmarks
  where id = target_benchmark_id and status = 'Active';

  if target_benchmark.id is null then raise exception 'Benchmark not found'; end if;
  if (
    select count(*)
    from public.talent7_benchmark_attempts attempt
    where attempt.user_id = acting_user
      and attempt.created_at >= date_trunc('day', now())
  ) >= 20 then
    raise exception 'Daily benchmark attempt limit reached';
  end if;

  insert into public.talent7_benchmark_attempts (
    benchmark_id, user_id, score, note
  ) values (
    target_benchmark.id,
    acting_user,
    target_score,
    nullif(btrim(target_note), '')
  )
  returning * into saved_attempt;

  return saved_attempt;
end;
$$;

create or replace function public.join_talent7_match_queue(
  target_activity text,
  target_skill_level text default 'Open',
  target_play_mode text default 'Either',
  target_match_format text default 'Any',
  target_region text default 'Global',
  target_note text default null
)
returns public.talent7_match_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_name text;
  saved_request public.talent7_match_requests;
  candidate public.talent7_match_requests;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  target_activity := btrim(coalesce(target_activity, ''));
  target_region := coalesce(nullif(btrim(target_region), ''), 'Global');
  target_note := nullif(btrim(target_note), '');

  if char_length(target_activity) not between 2 and 100 then raise exception 'Choose an activity'; end if;
  if target_skill_level not in ('Open', 'Beginner', 'Intermediate', 'Advanced', 'Pro') then raise exception 'Choose a valid skill level'; end if;
  if target_play_mode not in ('Either', 'In person', 'Online') then raise exception 'Choose a valid play mode'; end if;
  if target_match_format not in ('Any', 'Singles', 'Doubles', 'Team') then raise exception 'Choose a valid match format'; end if;
  if char_length(target_region) > 100 then raise exception 'Keep the region under 100 characters'; end if;
  if char_length(coalesce(target_note, '')) > 180 then raise exception 'Keep the note under 180 characters'; end if;

  select coalesce(nullif(btrim(profile.display_name), ''), nullif('@' || btrim(profile.username), ''), 'Talent7 challenger')
  into acting_name
  from public.profiles profile
  where profile.user_id = acting_user;

  if acting_name is null then raise exception 'Complete your Talent7 profile before joining matchmaking'; end if;

  update public.talent7_match_requests
  set status = 'Expired', updated_at = now()
  where user_id = acting_user
    and status in ('Waiting', 'Matched')
    and expires_at <= now();

  select * into saved_request
  from public.talent7_match_requests request
  where request.user_id = acting_user
    and lower(request.activity) = lower(target_activity)
    and request.status in ('Waiting', 'Matched')
  order by request.created_at desc
  limit 1
  for update;

  if saved_request.status = 'Matched' then return saved_request; end if;

  if saved_request.id is null then
    insert into public.talent7_match_requests (
      user_id, display_name, activity, skill_level, play_mode,
      match_format, region, note
    ) values (
      acting_user, acting_name, target_activity, target_skill_level, target_play_mode,
      target_match_format, target_region, target_note
    )
    returning * into saved_request;
  else
    update public.talent7_match_requests
    set display_name = acting_name,
        skill_level = target_skill_level,
        play_mode = target_play_mode,
        match_format = target_match_format,
        region = target_region,
        note = target_note,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = saved_request.id
    returning * into saved_request;
  end if;

  select request.* into candidate
  from public.talent7_match_requests request
  where request.id <> saved_request.id
    and request.user_id <> acting_user
    and request.status = 'Waiting'
    and request.expires_at > now()
    and lower(request.activity) = lower(target_activity)
    and (request.play_mode = 'Either' or target_play_mode = 'Either' or request.play_mode = target_play_mode)
    and (request.match_format = 'Any' or target_match_format = 'Any' or request.match_format = target_match_format)
  order by
    (lower(request.region) = lower(target_region)) desc,
    (request.skill_level = target_skill_level) desc,
    request.created_at asc
  limit 1
  for update skip locked;

  if candidate.id is not null then
    update public.talent7_match_requests
    set status = 'Matched', matched_request_id = saved_request.id, updated_at = now()
    where id = candidate.id and status = 'Waiting';

    if found then
      update public.talent7_match_requests
      set status = 'Matched', matched_request_id = candidate.id, updated_at = now()
      where id = saved_request.id
      returning * into saved_request;
    end if;
  end if;

  return saved_request;
end;
$$;

create or replace function public.withdraw_talent7_match_request(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_request public.talent7_match_requests;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;

  select * into target_request
  from public.talent7_match_requests request
  where request.id = target_request_id and request.user_id = acting_user
  for update;

  if target_request.id is null or target_request.status not in ('Waiting', 'Matched') then return false; end if;

  update public.talent7_match_requests
  set status = 'Withdrawn', updated_at = now()
  where id = target_request.id;

  if target_request.matched_request_id is not null then
    update public.talent7_match_requests
    set status = case when expires_at > now() then 'Waiting' else 'Expired' end,
        matched_request_id = null,
        updated_at = now()
    where id = target_request.matched_request_id
      and matched_request_id = target_request.id
      and status = 'Matched';
  end if;

  return true;
end;
$$;

create or replace function public.get_talent7_match_queue()
returns table (
  request_id uuid,
  display_name text,
  activity text,
  skill_level text,
  play_mode text,
  match_format text,
  region text,
  note text,
  request_status text,
  created_at timestamptz,
  expires_at timestamptz,
  is_mine boolean,
  matched_user_id uuid,
  matched_display_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    request.id,
    request.display_name,
    request.activity,
    request.skill_level,
    request.play_mode,
    request.match_format,
    request.region,
    request.note,
    request.status,
    request.created_at,
    request.expires_at,
    request.user_id = auth.uid(),
    case when request.user_id = auth.uid() then matched.user_id else null end,
    case when request.user_id = auth.uid() then matched.display_name else null end
  from public.talent7_match_requests request
  left join public.talent7_match_requests matched on matched.id = request.matched_request_id
  where request.expires_at > now()
    and (
      request.status = 'Waiting'
      or (request.user_id = auth.uid() and request.status = 'Matched')
    )
  order by (request.user_id = auth.uid()) desc, request.created_at asc;
$$;

-- Explicitly joining this queue is consent to receive an invite from the matched account,
-- even when the profile's general invitation setting is more restrictive.
create or replace function public.can_send_challenge_invite(target_user_id uuid, sender_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      profile.challenge_availability = 'Open to everyone'
      or (
        profile.challenge_availability = 'People I follow'
        and exists (
          select 1
          from public.profile_follows profile_follow
          where profile_follow.follower_id = target_user_id
            and profile_follow.following_id = sender_user_id
        )
      )
    from public.profiles profile
    where profile.user_id = target_user_id
  ), false)
  or exists (
    select 1
    from public.talent7_match_requests sender_request
    join public.talent7_match_requests target_request
      on target_request.id = sender_request.matched_request_id
    where sender_request.user_id = sender_user_id
      and target_request.user_id = target_user_id
      and sender_request.status = 'Matched'
      and target_request.status = 'Matched'
      and sender_request.expires_at > now()
      and target_request.expires_at > now()
  );
$$;

revoke all on function public.record_talent7_benchmark_attempt(uuid, numeric, text) from public;
revoke all on function public.join_talent7_match_queue(text, text, text, text, text, text) from public;
revoke all on function public.withdraw_talent7_match_request(uuid) from public;
revoke all on function public.get_talent7_match_queue() from public;
revoke all on function public.can_send_challenge_invite(uuid, uuid) from public;

grant execute on function public.record_talent7_benchmark_attempt(uuid, numeric, text) to authenticated;
grant execute on function public.join_talent7_match_queue(text, text, text, text, text, text) to authenticated;
grant execute on function public.withdraw_talent7_match_request(uuid) to authenticated;
grant execute on function public.get_talent7_match_queue() to anon, authenticated;
grant execute on function public.can_send_challenge_invite(uuid, uuid) to authenticated;

comment on table public.talent7_benchmarks is
  'Official free Talent7 starter activities that give a solo newcomer something immediate to do.';
comment on table public.talent7_benchmark_attempts is
  'Private self-reported personal-best history. Attempts do not grant XP, Rise Points, prizes, or verified results.';
comment on table public.talent7_match_requests is
  'Short-lived individual matchmaking requests. Safe public queue data is exposed only through get_talent7_match_queue().';

commit;
