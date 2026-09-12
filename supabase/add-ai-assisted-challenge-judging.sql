create extension if not exists "uuid-ossp";

create table if not exists public.challenge_ai_reviews (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  proof_id uuid not null references public.proofs(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  activity text not null check (char_length(activity) between 1 and 120),
  rubric_version text not null default 'breakdance-visual-v1' check (char_length(rubric_version) <= 60),
  model text not null check (char_length(model) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 1200),
  confidence text not null check (confidence in ('Low', 'Medium', 'High')),
  limitations text not null check (char_length(limitations) between 1 and 1200),
  criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
  observations jsonb not null default '[]'::jsonb check (jsonb_typeof(observations) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists challenge_ai_reviews_room_proof_idx
on public.challenge_ai_reviews (challenge_id, proof_id, created_at desc);

create index if not exists challenge_ai_reviews_requester_idx
on public.challenge_ai_reviews (requested_by, created_at desc);

alter table public.challenge_ai_reviews enable row level security;

revoke all on public.challenge_ai_reviews from anon, authenticated;
grant select on public.challenge_ai_reviews to authenticated;

drop policy if exists "Authorized officials can view AI challenge reviews" on public.challenge_ai_reviews;
create policy "Authorized officials can view AI challenge reviews"
on public.challenge_ai_reviews for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1 from public.challenges
    where challenges.id = challenge_ai_reviews.challenge_id
      and challenges.created_by = auth.uid()
  )
  or exists (
    select 1 from public.app_admins
    where app_admins.user_id = auth.uid()
  )
  or exists (
    select 1 from public.challenge_room_staff
    where challenge_room_staff.challenge_id = challenge_ai_reviews.challenge_id
      and challenge_room_staff.user_id = auth.uid()
      and challenge_room_staff.role = 'Judge'
      and challenge_room_staff.status = 'Accepted'
  )
);

alter table public.challenge_judge_scores
add column if not exists rubric_scores jsonb not null default '{}'::jsonb;

alter table public.challenge_judge_scores
add column if not exists markdowns jsonb not null default '[]'::jsonb;

alter table public.challenge_judge_scores
add column if not exists ai_review_id uuid references public.challenge_ai_reviews(id) on delete set null;

alter table public.challenge_judge_scores
drop constraint if exists challenge_judge_scores_team_a_score_check;

alter table public.challenge_judge_scores
drop constraint if exists challenge_judge_scores_team_b_score_check;

alter table public.challenge_judge_scores
alter column team_a_score type numeric(3,1) using team_a_score::numeric(3,1);

alter table public.challenge_judge_scores
alter column team_b_score type numeric(3,1) using team_b_score::numeric(3,1);

alter table public.challenge_judge_scores
add constraint challenge_judge_scores_team_a_score_check check (team_a_score between 0 and 7);

alter table public.challenge_judge_scores
add constraint challenge_judge_scores_team_b_score_check check (team_b_score between 0 and 7);

alter table public.challenge_judge_scores
drop constraint if exists challenge_judge_scores_rubric_scores_check;

alter table public.challenge_judge_scores
add constraint challenge_judge_scores_rubric_scores_check
check (jsonb_typeof(rubric_scores) = 'object' and octet_length(rubric_scores::text) <= 5000);

alter table public.challenge_judge_scores
drop constraint if exists challenge_judge_scores_markdowns_check;

alter table public.challenge_judge_scores
add constraint challenge_judge_scores_markdowns_check
check (jsonb_typeof(markdowns) = 'array' and octet_length(markdowns::text) <= 5000);

create or replace function public.submit_challenge_judge_scorecard(
  target_challenge_id uuid,
  target_team_a_score numeric,
  target_team_b_score numeric,
  target_rubric_scores jsonb,
  target_markdowns jsonb,
  target_notes text default null,
  target_ai_review_id uuid default null
)
returns setof public.challenge_judge_scores
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  criterion record;
begin
  if acting_user is null then
    raise exception 'Log in to submit a judge scorecard';
  end if;

  if not exists (
    select 1
    from public.challenge_room_staff
    join public.challenges on challenges.id = challenge_room_staff.challenge_id
    where challenge_room_staff.challenge_id = target_challenge_id
      and challenge_room_staff.user_id = acting_user
      and challenge_room_staff.role = 'Judge'
      and challenge_room_staff.status = 'Accepted'
      and challenges.status = 'Open'
  ) then
    raise exception 'Only a judge who accepted the invitation can score this open room';
  end if;

  if target_team_a_score is null or target_team_a_score < 0 or target_team_a_score > 7
     or target_team_b_score is null or target_team_b_score < 0 or target_team_b_score > 7 then
    raise exception 'Final judge scores must be between 0 and 7';
  end if;

  if jsonb_typeof(target_rubric_scores) <> 'object'
     or octet_length(target_rubric_scores::text) > 5000 then
    raise exception 'Invalid judging rubric';
  end if;

  for criterion in select key, value from jsonb_each(target_rubric_scores) loop
    if criterion.key not in ('musicality', 'technique', 'execution', 'originality', 'battle_presence') then
      raise exception 'Unknown judging criterion: %', criterion.key;
    end if;

    if jsonb_typeof(criterion.value) <> 'object'
       or jsonb_typeof(criterion.value -> 'team_a') <> 'number'
       or jsonb_typeof(criterion.value -> 'team_b') <> 'number'
       or (criterion.value ->> 'team_a')::numeric not between 0 and 7
       or (criterion.value ->> 'team_b')::numeric not between 0 and 7 then
      raise exception 'Every rubric score must contain Team A and Team B values from 0 to 7';
    end if;
  end loop;

  if (
    select count(*) from jsonb_object_keys(target_rubric_scores)
  ) <> 5 then
    raise exception 'Complete all five judging criteria';
  end if;

  if jsonb_typeof(target_markdowns) <> 'array'
     or jsonb_array_length(target_markdowns) > 20
     or octet_length(target_markdowns::text) > 5000 then
    raise exception 'Add no more than 20 concise markdown observations';
  end if;

  if target_notes is not null and char_length(target_notes) > 500 then
    raise exception 'Judge notes must be 500 characters or fewer';
  end if;

  if target_ai_review_id is not null and not exists (
    select 1 from public.challenge_ai_reviews
    where id = target_ai_review_id and challenge_id = target_challenge_id
  ) then
    raise exception 'The selected AI review does not belong to this challenge';
  end if;

  insert into public.challenge_judge_scores (
    challenge_id,
    judge_user_id,
    team_a_score,
    team_b_score,
    rubric_scores,
    markdowns,
    notes,
    ai_review_id
  ) values (
    target_challenge_id,
    acting_user,
    round(target_team_a_score, 1),
    round(target_team_b_score, 1),
    target_rubric_scores,
    target_markdowns,
    nullif(trim(target_notes), ''),
    target_ai_review_id
  )
  on conflict (challenge_id, judge_user_id) do update
  set team_a_score = excluded.team_a_score,
      team_b_score = excluded.team_b_score,
      rubric_scores = excluded.rubric_scores,
      markdowns = excluded.markdowns,
      notes = excluded.notes,
      ai_review_id = excluded.ai_review_id,
      updated_at = now();

  return query
  select * from public.challenge_judge_scores
  where challenge_id = target_challenge_id and judge_user_id = acting_user;
end;
$$;

revoke all on function public.submit_challenge_judge_scorecard(uuid, numeric, numeric, jsonb, jsonb, text, uuid) from public;
grant execute on function public.submit_challenge_judge_scorecard(uuid, numeric, numeric, jsonb, jsonb, text, uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.challenge_ai_reviews;
exception
  when duplicate_object then null;
end $$;

comment on table public.challenge_ai_reviews is
  'Private AI-assisted visual observations for human challenge judges. AI reviews never publish or decide a winner by themselves.';
