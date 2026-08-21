begin;

alter table public.challenges
add column if not exists room_share_token uuid;

update public.challenges
set room_share_token = gen_random_uuid()
where room_share_token is null;

alter table public.challenges
alter column room_share_token set default gen_random_uuid();

alter table public.challenges
alter column room_share_token set not null;

create unique index if not exists challenges_room_share_token_unique
on public.challenges (room_share_token);

create or replace function public.get_public_challenge_room_preview(target_share_token uuid)
returns table (
  challenge_title text,
  challenge_lane text,
  room_status text,
  rules text,
  sport_type text,
  match_format text,
  roster_size integer,
  booking_region text,
  voting_status text,
  team_a_name text,
  team_b_name text,
  winner_name text,
  final_score text,
  created_at timestamptz,
  is_live boolean,
  registered_players bigint,
  audience_count bigint,
  vote_count bigint,
  rating_average numeric,
  rating_count bigint,
  proof_count bigint,
  unique_views bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved_challenge as (
    select
      challenge.*,
      coalesce(
        nullif((
          select string_agg(challenge_join.participant_name, ' + ' order by challenge_join.created_at)
          from public.challenge_joins challenge_join
          where challenge_join.challenge_id = challenge.id
            and challenge_join.role = 'Challenger'
            and challenge_join.side = 'Team A'
        ), ''),
        nullif(challenge.team_a, ''),
        'Team A'
      ) as resolved_team_a,
      coalesce(
        nullif((
          select string_agg(challenge_join.participant_name, ' + ' order by challenge_join.created_at)
          from public.challenge_joins challenge_join
          where challenge_join.challenge_id = challenge.id
            and challenge_join.role = 'Challenger'
            and challenge_join.side in ('Team B', 'Open invite')
        ), ''),
        nullif(challenge.team_b, ''),
        'Team B'
      ) as resolved_team_b
    from public.challenges challenge
    where challenge.room_share_token = target_share_token
    limit 1
  )
  select
    challenge.title as challenge_title,
    challenge.lane as challenge_lane,
    challenge.status as room_status,
    challenge.rules,
    challenge.sport_type,
    challenge.match_format,
    challenge.roster_size,
    challenge.booking_region,
    challenge.voting_status,
    challenge.resolved_team_a as team_a_name,
    challenge.resolved_team_b as team_b_name,
    case
      when challenge.status <> 'Completed' then null
      when challenge.winner = challenge.team_a then challenge.resolved_team_a
      when challenge.winner = challenge.team_b then challenge.resolved_team_b
      else nullif(challenge.winner, '')
    end as winner_name,
    case when challenge.status = 'Completed' then challenge.final_score else null end as final_score,
    challenge.created_at,
    exists (
      select 1
      from public.challenge_live_sessions live_session
      where live_session.challenge_id = challenge.id
        and live_session.status = 'Live'
    ) as is_live,
    (
      select count(*)
      from public.challenge_joins challenge_join
      where challenge_join.challenge_id = challenge.id
        and challenge_join.role = 'Challenger'
    ) as registered_players,
    (
      select count(*)
      from public.challenge_joins challenge_join
      where challenge_join.challenge_id = challenge.id
        and challenge_join.role = 'Audience'
    ) as audience_count,
    (select count(*) from public.votes vote where vote.challenge_id = challenge.id) as vote_count,
    coalesce(
      (select round(avg(rating.rating)::numeric, 1) from public.ratings rating where rating.challenge_id = challenge.id),
      0::numeric
    ) as rating_average,
    (select count(*) from public.ratings rating where rating.challenge_id = challenge.id) as rating_count,
    (select count(*) from public.proofs proof where proof.challenge_id = challenge.id) as proof_count,
    (select count(*) from public.challenge_room_views room_view where room_view.challenge_id = challenge.id) as unique_views
  from resolved_challenge challenge;
$$;

revoke all on function public.get_public_challenge_room_preview(uuid) from public;
grant execute on function public.get_public_challenge_room_preview(uuid) to anon, authenticated;

commit;
