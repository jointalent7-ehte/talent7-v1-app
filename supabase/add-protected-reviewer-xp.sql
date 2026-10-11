-- A separate, proof-gated progression track for accepted room judges.
-- Reviewer XP never changes competition XP, Rank Points, placement, prizes, or results.
-- Run after add-weekly-retention-missions.sql.

begin;

create table if not exists public.talent7_reviewer_profiles (
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_xp integer not null default 0 check (review_xp >= 0),
  completed_reviews integer not null default 0 check (completed_reviews >= 0),
  tier text not null default 'Observer' check (tier in (
    'Observer', 'Reviewer', 'Trusted Reviewer', 'Senior Reviewer', 'Review Captain'
  )),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create table if not exists public.talent7_reviewer_reward_events (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.talent7_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  judge_score_id uuid not null references public.challenge_judge_scores(id) on delete restrict,
  xp_delta integer not null default 15 check (xp_delta = 15),
  tier_before text not null,
  tier_after text not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id),
  unique (judge_score_id)
);

create index if not exists talent7_reviewer_profiles_season_idx
on public.talent7_reviewer_profiles (season_id, review_xp desc, completed_reviews desc);

create index if not exists talent7_reviewer_reward_events_user_idx
on public.talent7_reviewer_reward_events (user_id, created_at desc);

alter table public.talent7_reviewer_profiles enable row level security;
alter table public.talent7_reviewer_reward_events enable row level security;

revoke all on public.talent7_reviewer_profiles,
  public.talent7_reviewer_reward_events
from public, anon, authenticated;

grant select on public.talent7_reviewer_profiles,
  public.talent7_reviewer_reward_events
to authenticated;

drop policy if exists "Users read their own reviewer progress"
on public.talent7_reviewer_profiles;
create policy "Users read their own reviewer progress"
on public.talent7_reviewer_profiles for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users read their own reviewer rewards"
on public.talent7_reviewer_reward_events;
create policy "Users read their own reviewer rewards"
on public.talent7_reviewer_reward_events for select to authenticated
using (auth.uid() = user_id);

create or replace function public.talent7_reviewer_tier_for_xp(target_xp integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when greatest(coalesce(target_xp, 0), 0) >= 700 then 'Review Captain'
    when greatest(coalesce(target_xp, 0), 0) >= 350 then 'Senior Reviewer'
    when greatest(coalesce(target_xp, 0), 0) >= 150 then 'Trusted Reviewer'
    when greatest(coalesce(target_xp, 0), 0) >= 50 then 'Reviewer'
    else 'Observer'
  end;
$$;

create or replace function public.award_talent7_reviewer_xp(
  target_challenge_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_challenge public.challenges;
  target_score public.challenge_judge_scores;
  target_season public.talent7_seasons;
  previous_tier text;
  next_tier text;
  saved_event_id uuid;
  new_review_total integer;
begin
  if target_challenge_id is null or target_user_id is null then return false; end if;

  select * into target_challenge
  from public.challenges
  where id = target_challenge_id;

  if target_challenge.id is null
     or target_challenge.status <> 'Completed'
     or target_challenge.winner is null
     or (
       target_challenge.winner is distinct from target_challenge.team_a
       and target_challenge.winner is distinct from target_challenge.team_b
     )
  then
    return false;
  end if;

  -- The judge must have explicitly accepted the role and submitted a score.
  if not exists (
    select 1
    from public.challenge_room_staff staff
    where staff.challenge_id = target_challenge_id
      and staff.user_id = target_user_id
      and staff.role = 'Judge'
      and staff.status = 'Accepted'
  ) then
    return false;
  end if;

  select * into target_score
  from public.challenge_judge_scores score
  where score.challenge_id = target_challenge_id
    and score.judge_user_id = target_user_id;

  if target_score.id is null then return false; end if;

  -- A creator, challenger, invitee, or team participant cannot earn judge XP.
  if public.talent7_challenge_side_for_user(target_challenge_id, target_user_id) is not null then
    return false;
  end if;

  -- At least one submitted proof must have passed the protected proof-review flow.
  if not exists (
    select 1
    from public.proofs proof
    where proof.challenge_id = target_challenge_id
      and proof.review_status = 'Accepted'
  ) then
    return false;
  end if;

  select * into target_season
  from public.talent7_seasons season
  where season.id = public.ensure_talent7_active_season();

  if coalesce(target_challenge.completed_at, target_challenge.created_at) < target_season.starts_at
     or coalesce(target_challenge.completed_at, target_challenge.created_at) >= target_season.ends_at
  then
    return false;
  end if;

  insert into public.talent7_reviewer_profiles (season_id, user_id)
  values (target_season.id, target_user_id)
  on conflict do nothing;

  select tier into previous_tier
  from public.talent7_reviewer_profiles
  where season_id = target_season.id and user_id = target_user_id
  for update;

  next_tier := public.talent7_reviewer_tier_for_xp(
    (select review_xp from public.talent7_reviewer_profiles
     where season_id = target_season.id and user_id = target_user_id) + 15
  );

  insert into public.talent7_reviewer_reward_events (
    season_id, user_id, challenge_id, judge_score_id,
    xp_delta, tier_before, tier_after
  ) values (
    target_season.id, target_user_id, target_challenge_id, target_score.id,
    15, previous_tier, next_tier
  )
  on conflict (challenge_id, user_id) do nothing
  returning id into saved_event_id;

  if saved_event_id is null then return false; end if;

  update public.talent7_reviewer_profiles
  set review_xp = review_xp + 15,
      completed_reviews = completed_reviews + 1,
      tier = next_tier,
      updated_at = now()
  where season_id = target_season.id and user_id = target_user_id
  returning completed_reviews into new_review_total;

  if new_review_total = 1 then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'first-protected-review', 'Fair Play Reviewer',
      'Completed a protected, proof-backed room review as an accepted judge.',
      'Common', 'reviewer', target_challenge_id
    ) on conflict (user_id, trophy_key) do nothing;
  elsif new_review_total = 10 then
    insert into public.talent7_trophies (
      user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
    ) values (
      target_user_id, 'ten-protected-reviews', 'Trusted Eye',
      'Completed ten protected, proof-backed room reviews.',
      'Rare', 'reviewer', target_challenge_id
    ) on conflict (user_id, trophy_key) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.award_talent7_reviewers_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reviewer_id uuid;
begin
  if new.status <> 'Completed'
     or (tg_op = 'UPDATE' and old.status = 'Completed')
  then
    return new;
  end if;

  for reviewer_id in
    select distinct score.judge_user_id
    from public.challenge_judge_scores score
    where score.challenge_id = new.id
  loop
    perform public.award_talent7_reviewer_xp(new.id, reviewer_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists award_talent7_reviewers_on_completion on public.challenges;
create trigger award_talent7_reviewers_on_completion
after update of status on public.challenges
for each row execute function public.award_talent7_reviewers_after_completion();

create or replace function public.award_talent7_reviewers_after_proof_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reviewer_id uuid;
begin
  if new.review_status <> 'Accepted'
     or (tg_op = 'UPDATE' and old.review_status = 'Accepted')
  then
    return new;
  end if;

  for reviewer_id in
    select distinct score.judge_user_id
    from public.challenge_judge_scores score
    join public.challenges challenge on challenge.id = score.challenge_id
    where score.challenge_id = new.challenge_id
      and challenge.status = 'Completed'
  loop
    perform public.award_talent7_reviewer_xp(new.challenge_id, reviewer_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists award_talent7_reviewers_on_proof_acceptance on public.proofs;
create trigger award_talent7_reviewers_on_proof_acceptance
after insert or update of review_status on public.proofs
for each row execute function public.award_talent7_reviewers_after_proof_acceptance();

create or replace function public.refresh_my_talent7_reviewer_progress()
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
  if acting_user is null then raise exception 'Log in before refreshing reviewer progress'; end if;

  for target_challenge_id in
    select score.challenge_id
    from public.challenge_judge_scores score
    join public.challenges challenge on challenge.id = score.challenge_id
    where score.judge_user_id = acting_user
      and challenge.status = 'Completed'
      and exists (
        select 1 from public.proofs proof
        where proof.challenge_id = challenge.id and proof.review_status = 'Accepted'
      )
  loop
    if public.award_talent7_reviewer_xp(target_challenge_id, acting_user) then
      awarded := awarded + 1;
    end if;
  end loop;

  return awarded;
end;
$$;

revoke all on function public.talent7_reviewer_tier_for_xp(integer) from public;
revoke all on function public.award_talent7_reviewer_xp(uuid, uuid) from public;
revoke all on function public.award_talent7_reviewers_after_completion() from public;
revoke all on function public.award_talent7_reviewers_after_proof_acceptance() from public;
revoke all on function public.refresh_my_talent7_reviewer_progress() from public, anon;
grant execute on function public.refresh_my_talent7_reviewer_progress() to authenticated;

comment on table public.talent7_reviewer_profiles is
  'Separate seasonal Reviewer XP earned only from completed, accepted-role, proof-backed room judging. It never affects Rank Points, results, prizes, or participant progression.';

comment on table public.talent7_reviewer_reward_events is
  'Idempotent audit trail for protected judge reviews. Score edits and repeated refreshes cannot create additional rewards.';

commit;
