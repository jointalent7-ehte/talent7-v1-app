-- Repairs reaction writes for installations that already ran
-- add-challenge-live-streams.sql. The function returns a column named
-- "reaction", so column-list ON CONFLICT targets can be ambiguous in PL/pgSQL.

create or replace function public.send_challenge_live_reaction(
  target_challenge_id uuid,
  target_reaction text
)
returns table(
  live_session_id uuid,
  challenge_id uuid,
  reaction text,
  reaction_count bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  active_session_id uuid;
begin
  if acting_user is null then
    raise exception 'Log in to react to a live room';
  end if;

  if target_reaction not in ('Fire', 'Applause', 'Wow', 'Strong', 'Love') then
    raise exception 'Invalid live reaction';
  end if;

  select sessions.id into active_session_id
  from public.challenge_live_sessions sessions
  where sessions.challenge_id = target_challenge_id
    and sessions.status = 'Live';

  if active_session_id is null then
    raise exception 'This room is not live';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(active_session_id::text || ':' || acting_user::text, 0)
  );

  if exists (
    select 1
    from public.challenge_live_reactions viewer_reactions
    where viewer_reactions.live_session_id = active_session_id
      and viewer_reactions.user_id = acting_user
      and viewer_reactions.last_reacted_at > now() - interval '1 second'
  ) then
    raise exception 'Please wait a moment before reacting again';
  end if;

  insert into public.challenge_live_reactions (
    live_session_id,
    challenge_id,
    user_id,
    reaction,
    reaction_count,
    last_reacted_at
  ) values (
    active_session_id,
    target_challenge_id,
    acting_user,
    target_reaction,
    1,
    now()
  )
  on conflict on constraint one_live_reaction_counter_per_user do update
  set reaction_count = challenge_live_reactions.reaction_count + 1,
      last_reacted_at = now();

  insert into public.challenge_live_reaction_totals (
    live_session_id,
    challenge_id,
    reaction,
    reaction_count,
    updated_at
  ) values (
    active_session_id,
    target_challenge_id,
    target_reaction,
    1,
    now()
  )
  on conflict on constraint challenge_live_reaction_totals_pkey do update
  set reaction_count = challenge_live_reaction_totals.reaction_count + 1,
      updated_at = now();

  return query
  select
    totals.live_session_id,
    totals.challenge_id,
    totals.reaction,
    totals.reaction_count,
    totals.updated_at
  from public.challenge_live_reaction_totals totals
  where totals.live_session_id = active_session_id
    and totals.reaction = target_reaction;
end;
$$;

revoke all on function public.send_challenge_live_reaction(uuid, text) from public;
grant execute on function public.send_challenge_live_reaction(uuid, text) to authenticated;
