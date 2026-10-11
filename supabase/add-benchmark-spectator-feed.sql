-- Opt-in spectator feed for administrator-verified benchmark videos.
-- Reactions are lightweight community encouragement only. They never affect
-- verification, leaderboard order, XP, Rank Points, prizes, or official results.

begin;

alter table public.talent7_benchmark_attempts
  add column if not exists feed_visible boolean not null default false,
  add column if not exists feed_caption text,
  add column if not exists feed_published_at timestamptz;

alter table public.talent7_benchmark_attempts
  drop constraint if exists talent7_benchmark_attempts_feed_caption_check;

alter table public.talent7_benchmark_attempts
  add constraint talent7_benchmark_attempts_feed_caption_check
    check (feed_caption is null or char_length(feed_caption) <= 180);

create index if not exists talent7_benchmark_attempts_feed_idx
on public.talent7_benchmark_attempts (feed_published_at desc)
where feed_visible;

create table if not exists public.talent7_benchmark_feed_reactions (
  id uuid primary key default uuid_generate_v4(),
  attempt_id uuid not null references public.talent7_benchmark_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('Respect', 'Strong form', 'Motivating')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, user_id)
);

create index if not exists talent7_benchmark_feed_reactions_attempt_idx
on public.talent7_benchmark_feed_reactions (attempt_id, reaction);

alter table public.talent7_benchmark_feed_reactions enable row level security;
revoke all on public.talent7_benchmark_feed_reactions from public, anon, authenticated;

create or replace function public.enforce_talent7_benchmark_feed_visibility()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.verification_status <> 'Verified'
    or new.proof_type <> 'Video'
    or new.proof_url is null
  then
    new.feed_visible := false;
  end if;

  if new.feed_visible and new.feed_published_at is null then
    new.feed_published_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_talent7_benchmark_feed_visibility_trigger
on public.talent7_benchmark_attempts;

create trigger enforce_talent7_benchmark_feed_visibility_trigger
before insert or update on public.talent7_benchmark_attempts
for each row execute function public.enforce_talent7_benchmark_feed_visibility();

create or replace function public.set_talent7_benchmark_feed_visibility(
  target_attempt_id uuid,
  target_visible boolean,
  target_caption text default null
)
returns public.talent7_benchmark_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_attempt public.talent7_benchmark_attempts;
  normalized_caption text := nullif(btrim(coalesce(target_caption, '')), '');
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  if char_length(coalesce(normalized_caption, '')) > 180 then
    raise exception 'Keep the feed caption within 180 characters';
  end if;

  select * into target_attempt
  from public.talent7_benchmark_attempts
  where id = target_attempt_id
  for update;

  if target_attempt.id is null then raise exception 'Benchmark attempt not found'; end if;
  if target_attempt.user_id <> acting_user then raise exception 'You can publish only your own benchmark video'; end if;

  if coalesce(target_visible, false) then
    if target_attempt.verification_status <> 'Verified' then
      raise exception 'Only administrator-verified benchmark proof can enter the spectator feed';
    end if;
    if target_attempt.proof_type <> 'Video' or target_attempt.proof_url is null then
      raise exception 'Upload and verify a benchmark video before publishing it';
    end if;
    if target_attempt.proof_url not like '%/challenge-proofs/%'
      and target_attempt.proof_url not like '%/storage/v1/object/public/challenge-proofs/%'
    then
      raise exception 'Only videos uploaded through Talent7 can enter the spectator feed';
    end if;
  end if;

  update public.talent7_benchmark_attempts
  set feed_visible = coalesce(target_visible, false),
      feed_caption = case when coalesce(target_visible, false) then normalized_caption else feed_caption end,
      feed_published_at = case
        when coalesce(target_visible, false) then coalesce(feed_published_at, now())
        else feed_published_at
      end,
      updated_at = now()
  where id = target_attempt_id
  returning * into target_attempt;

  return target_attempt;
end;
$$;

create or replace function public.react_to_talent7_benchmark_feed(
  target_attempt_id uuid,
  target_reaction text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  normalized_reaction text := initcap(lower(btrim(coalesce(target_reaction, ''))));
  target_attempt public.talent7_benchmark_attempts;
begin
  if acting_user is null then raise exception 'Log in before reacting'; end if;

  select * into target_attempt
  from public.talent7_benchmark_attempts
  where id = target_attempt_id
  for update;

  if target_attempt.id is null
    or not target_attempt.feed_visible
    or target_attempt.verification_status <> 'Verified'
  then
    raise exception 'This benchmark video is not available in the spectator feed';
  end if;
  if target_attempt.user_id = acting_user then raise exception 'You cannot react to your own benchmark video'; end if;
  if target_attempt.feed_published_at + interval '24 hours' <= now() then
    raise exception 'The 24-hour reaction window has closed';
  end if;

  if lower(btrim(coalesce(target_reaction, ''))) = 'remove' then
    delete from public.talent7_benchmark_feed_reactions
    where attempt_id = target_attempt_id and user_id = acting_user;
    return 'Removed';
  end if;

  if normalized_reaction not in ('Respect', 'Strong Form', 'Motivating') then
    raise exception 'Choose Respect, Strong form, or Motivating';
  end if;

  if normalized_reaction = 'Strong Form' then normalized_reaction := 'Strong form'; end if;

  insert into public.talent7_benchmark_feed_reactions (attempt_id, user_id, reaction)
  values (target_attempt_id, acting_user, normalized_reaction)
  on conflict (attempt_id, user_id) do update
  set reaction = excluded.reaction, updated_at = now();

  return normalized_reaction;
end;
$$;

create or replace function public.get_talent7_benchmark_spectator_feed(
  target_benchmark_id uuid default null,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  attempt_id uuid,
  benchmark_id uuid,
  benchmark_title text,
  activity text,
  display_name text,
  username text,
  avatar_url text,
  region text,
  score numeric,
  unit text,
  proof_url text,
  feed_caption text,
  published_at timestamptz,
  reaction_closes_at timestamptz,
  reactions_open boolean,
  respect_count bigint,
  strong_form_count bigint,
  motivating_count bigint,
  viewer_reaction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    attempt.id,
    attempt.benchmark_id,
    benchmark.title,
    benchmark.activity,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    profile.region,
    attempt.score,
    benchmark.unit,
    attempt.proof_url,
    attempt.feed_caption,
    attempt.feed_published_at,
    attempt.feed_published_at + interval '24 hours',
    attempt.feed_published_at + interval '24 hours' > now(),
    count(reaction.id) filter (where reaction.reaction = 'Respect'),
    count(reaction.id) filter (where reaction.reaction = 'Strong form'),
    count(reaction.id) filter (where reaction.reaction = 'Motivating'),
    max(reaction.reaction) filter (where reaction.user_id = auth.uid())
  from public.talent7_benchmark_attempts attempt
  join public.talent7_benchmarks benchmark on benchmark.id = attempt.benchmark_id
  join public.profiles profile on profile.user_id = attempt.user_id
  left join public.talent7_benchmark_feed_reactions reaction on reaction.attempt_id = attempt.id
  where attempt.feed_visible
    and attempt.verification_status = 'Verified'
    and attempt.proof_type = 'Video'
    and attempt.proof_url is not null
    and (target_benchmark_id is null or attempt.benchmark_id = target_benchmark_id)
  group by attempt.id, benchmark.id, profile.user_id
  order by attempt.feed_published_at desc, attempt.id
  limit least(greatest(coalesce(result_limit, 20), 1), 50)
  offset greatest(coalesce(result_offset, 0), 0);
$$;

revoke all on function public.set_talent7_benchmark_feed_visibility(uuid, boolean, text) from public;
revoke all on function public.react_to_talent7_benchmark_feed(uuid, text) from public;
revoke all on function public.get_talent7_benchmark_spectator_feed(uuid, integer, integer) from public;

grant execute on function public.set_talent7_benchmark_feed_visibility(uuid, boolean, text) to authenticated;
grant execute on function public.react_to_talent7_benchmark_feed(uuid, text) to authenticated;
grant execute on function public.get_talent7_benchmark_spectator_feed(uuid, integer, integer) to anon, authenticated;

comment on table public.talent7_benchmark_feed_reactions is
  'Positive reactions on owner-opted-in, administrator-verified benchmark videos. Reactions have no competitive value.';
comment on function public.get_talent7_benchmark_spectator_feed(uuid, integer, integer) is
  'Returns only verified videos whose owners explicitly enabled public feed visibility. Private notes and reviewer data are excluded.';

commit;
