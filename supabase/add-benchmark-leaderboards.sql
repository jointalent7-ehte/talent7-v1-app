-- Opt-in benchmark leaderboards with separate community and proof-verified boards.
-- Public leaderboard functions never return proof URLs or private attempt notes.

begin;

alter table public.talent7_benchmark_attempts
  add column if not exists leaderboard_visible boolean not null default false,
  add column if not exists proof_type text,
  add column if not exists proof_url text,
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.talent7_benchmark_attempts
  drop constraint if exists talent7_benchmark_attempts_proof_type_check,
  drop constraint if exists talent7_benchmark_attempts_proof_url_check,
  drop constraint if exists talent7_benchmark_attempts_review_note_check;

alter table public.talent7_benchmark_attempts
  add constraint talent7_benchmark_attempts_proof_type_check
    check (proof_type is null or proof_type in ('Video', 'Image', 'Link')),
  add constraint talent7_benchmark_attempts_proof_url_check
    check (proof_url is null or (char_length(proof_url) between 8 and 2000 and proof_url ~* '^https://')),
  add constraint talent7_benchmark_attempts_review_note_check
    check (review_note is null or char_length(review_note) <= 500);

create index if not exists talent7_benchmark_attempts_leaderboard_idx
on public.talent7_benchmark_attempts (benchmark_id, verification_status, score, created_at)
where leaderboard_visible;

create index if not exists talent7_benchmark_attempts_review_queue_idx
on public.talent7_benchmark_attempts (created_at)
where verification_status = 'Proof submitted';

create or replace function public.set_talent7_benchmark_leaderboard_visibility(
  target_attempt_id uuid,
  target_visible boolean
)
returns public.talent7_benchmark_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_attempt public.talent7_benchmark_attempts;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;

  select * into target_attempt
  from public.talent7_benchmark_attempts
  where id = target_attempt_id
  for update;

  if target_attempt.id is null then raise exception 'Benchmark attempt not found'; end if;
  if target_attempt.user_id <> acting_user then raise exception 'You can publish only your own benchmark attempt'; end if;
  if target_visible and target_attempt.verification_status = 'Rejected' then
    raise exception 'Submit new proof before publishing this rejected attempt';
  end if;

  update public.talent7_benchmark_attempts
  set leaderboard_visible = false, updated_at = now()
  where user_id = acting_user and benchmark_id = target_attempt.benchmark_id;

  if coalesce(target_visible, false) then
    update public.talent7_benchmark_attempts
    set leaderboard_visible = true, updated_at = now()
    where id = target_attempt.id;
  end if;

  select * into target_attempt from public.talent7_benchmark_attempts where id = target_attempt.id;

  return target_attempt;
end;
$$;

create or replace function public.submit_talent7_benchmark_proof(
  target_attempt_id uuid,
  target_proof_type text,
  target_proof_url text
)
returns public.talent7_benchmark_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_attempt public.talent7_benchmark_attempts;
  normalized_url text := btrim(coalesce(target_proof_url, ''));
  normalized_type text := initcap(lower(btrim(coalesce(target_proof_type, ''))));
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  if normalized_type not in ('Video', 'Image', 'Link') then raise exception 'Choose Video, Image, or Link'; end if;
  if char_length(normalized_url) not between 8 and 2000 or normalized_url !~* '^https://' then
    raise exception 'Enter a valid public or unlisted HTTPS proof link';
  end if;

  select * into target_attempt
  from public.talent7_benchmark_attempts
  where id = target_attempt_id
  for update;

  if target_attempt.id is null then raise exception 'Benchmark attempt not found'; end if;
  if target_attempt.user_id <> acting_user then raise exception 'You can submit proof only for your own attempt'; end if;

  update public.talent7_benchmark_attempts
  set leaderboard_visible = false, updated_at = now()
  where user_id = acting_user and benchmark_id = target_attempt.benchmark_id;

  update public.talent7_benchmark_attempts
  set proof_type = normalized_type,
      proof_url = normalized_url,
      verification_status = 'Proof submitted',
      leaderboard_visible = true,
      review_note = null,
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
  where id = target_attempt.id
  returning * into target_attempt;

  return target_attempt;
end;
$$;

create or replace function public.review_talent7_benchmark_attempt(
  target_attempt_id uuid,
  target_decision text,
  target_review_note text default null
)
returns public.talent7_benchmark_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_attempt public.talent7_benchmark_attempts;
  normalized_decision text := initcap(lower(btrim(coalesce(target_decision, ''))));
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where user_id = acting_user
  ) then raise exception 'Only a Talent7 app administrator can review benchmark proof'; end if;
  if normalized_decision not in ('Verified', 'Rejected') then raise exception 'Choose Verified or Rejected'; end if;
  if char_length(coalesce(target_review_note, '')) > 500 then raise exception 'Keep the review note under 500 characters'; end if;

  select * into target_attempt
  from public.talent7_benchmark_attempts
  where id = target_attempt_id
  for update;

  if target_attempt.id is null then raise exception 'Benchmark attempt not found'; end if;
  if target_attempt.verification_status <> 'Proof submitted' or target_attempt.proof_url is null then
    raise exception 'This attempt has no pending proof submission';
  end if;

  update public.talent7_benchmark_attempts
  set verification_status = normalized_decision,
      leaderboard_visible = case when normalized_decision = 'Verified' then true else false end,
      review_note = nullif(btrim(target_review_note), ''),
      reviewed_by = acting_user,
      reviewed_at = now(),
      updated_at = now()
  where id = target_attempt.id
  returning * into target_attempt;

  return target_attempt;
end;
$$;

create or replace function public.get_talent7_benchmark_leaderboard(
  target_benchmark_id uuid,
  target_board text default 'Community',
  target_period text default 'All time',
  result_limit integer default 20
)
returns table (
  rank_position bigint,
  attempt_id uuid,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  region text,
  score numeric,
  verification_status text,
  attempted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_board text := initcap(lower(btrim(coalesce(target_board, 'Community'))));
  normalized_period text := initcap(lower(btrim(coalesce(target_period, 'All time'))));
  benchmark_direction text;
  period_start timestamptz;
  period_end timestamptz;
begin
  if normalized_board not in ('Community', 'Verified') then raise exception 'Leaderboard board must be Community or Verified'; end if;
  if normalized_period not in ('Daily', 'Weekly', 'Season', 'All Time') then
    raise exception 'Leaderboard period must be Daily, Weekly, Season, or All time';
  end if;

  select score_direction into benchmark_direction
  from public.talent7_benchmarks
  where id = target_benchmark_id and status = 'Active';
  if benchmark_direction is null then return; end if;

  if normalized_period = 'Daily' then
    period_start := date_trunc('day', now());
  elsif normalized_period = 'Weekly' then
    period_start := date_trunc('week', now());
  elsif normalized_period = 'Season' then
    select starts_at, ends_at into period_start, period_end
    from public.talent7_seasons
    where status = 'Active'
    order by starts_at desc
    limit 1;
    if period_start is null then return; end if;
  end if;

  return query
  with eligible as (
    select
      attempt.id as attempt_id,
      attempt.user_id,
      profile.display_name,
      profile.username,
      profile.avatar_url,
      profile.region,
      attempt.score,
      attempt.verification_status,
      attempt.created_at,
      row_number() over (
        partition by attempt.user_id
        order by
          case when benchmark_direction = 'Higher' then attempt.score end desc nulls last,
          case when benchmark_direction = 'Lower' then attempt.score end asc nulls last,
          attempt.created_at asc
      ) as user_best
    from public.talent7_benchmark_attempts attempt
    join public.profiles profile on profile.user_id = attempt.user_id
    where attempt.benchmark_id = target_benchmark_id
      and attempt.leaderboard_visible
      and attempt.verification_status <> 'Rejected'
      and (normalized_board = 'Community' or attempt.verification_status = 'Verified')
      and (period_start is null or attempt.created_at >= period_start)
      and (period_end is null or attempt.created_at < period_end)
  ),
  best_attempts as (
    select * from eligible where user_best = 1
  ),
  ranked as (
    select
      dense_rank() over (
        order by
          case when benchmark_direction = 'Higher' then best.score end desc nulls last,
          case when benchmark_direction = 'Lower' then best.score end asc nulls last
      ) as rank_position,
      best.*
    from best_attempts best
  )
  select
    ranked.rank_position,
    ranked.attempt_id,
    ranked.user_id,
    ranked.display_name,
    ranked.username,
    ranked.avatar_url,
    ranked.region,
    ranked.score,
    ranked.verification_status,
    ranked.created_at as attempted_at
  from ranked
  order by ranked.rank_position, ranked.created_at, ranked.display_name
  limit least(greatest(coalesce(result_limit, 20), 1), 100);
end;
$$;

create or replace function public.get_talent7_benchmark_proof_queue(result_limit integer default 30)
returns table (
  attempt_id uuid,
  benchmark_id uuid,
  benchmark_title text,
  display_name text,
  username text,
  score numeric,
  unit text,
  proof_type text,
  proof_url text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where user_id = acting_user
  ) then raise exception 'Only a Talent7 app administrator can view benchmark proof'; end if;

  return query
  select
    attempt.id,
    attempt.benchmark_id,
    benchmark.title,
    profile.display_name,
    profile.username,
    attempt.score,
    benchmark.unit,
    attempt.proof_type,
    attempt.proof_url,
    attempt.updated_at
  from public.talent7_benchmark_attempts attempt
  join public.talent7_benchmarks benchmark on benchmark.id = attempt.benchmark_id
  join public.profiles profile on profile.user_id = attempt.user_id
  where attempt.verification_status = 'Proof submitted'
  order by attempt.updated_at
  limit least(greatest(coalesce(result_limit, 30), 1), 100);
end;
$$;

revoke all on function public.set_talent7_benchmark_leaderboard_visibility(uuid, boolean) from public;
revoke all on function public.submit_talent7_benchmark_proof(uuid, text, text) from public;
revoke all on function public.review_talent7_benchmark_attempt(uuid, text, text) from public;
revoke all on function public.get_talent7_benchmark_leaderboard(uuid, text, text, integer) from public;
revoke all on function public.get_talent7_benchmark_proof_queue(integer) from public;

grant execute on function public.set_talent7_benchmark_leaderboard_visibility(uuid, boolean) to authenticated;
grant execute on function public.submit_talent7_benchmark_proof(uuid, text, text) to authenticated;
grant execute on function public.review_talent7_benchmark_attempt(uuid, text, text) to authenticated;
grant execute on function public.get_talent7_benchmark_leaderboard(uuid, text, text, integer) to anon, authenticated;
grant execute on function public.get_talent7_benchmark_proof_queue(integer) to authenticated;

comment on function public.get_talent7_benchmark_leaderboard(uuid, text, text, integer) is
  'Returns opt-in benchmark standings without proof URLs, private notes, emails, or account identifiers.';
comment on function public.get_talent7_benchmark_proof_queue(integer) is
  'Admin-only benchmark proof review queue. Proof URLs are never returned by public leaderboard functions.';
comment on table public.talent7_benchmark_attempts is
  'Private-by-default benchmark history with opt-in community standings and separately reviewed proof-verified standings. Attempts grant no XP, Rise Points, prizes, or official challenge result.';

commit;
