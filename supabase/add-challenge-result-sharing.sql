begin;

alter table public.challenges
add column if not exists result_share_token uuid;

update public.challenges
set result_share_token = gen_random_uuid()
where result_share_token is null;

alter table public.challenges
alter column result_share_token set default gen_random_uuid();

alter table public.challenges
alter column result_share_token set not null;

create unique index if not exists challenges_result_share_token_unique
on public.challenges (result_share_token);

create or replace function public.get_challenge_result_preview(target_share_token uuid)
returns table (
  challenge_title text,
  challenge_lane text,
  sport_type text,
  match_format text,
  roster_size integer,
  booking_region text,
  team_a_name text,
  team_b_name text,
  winner_name text,
  winner_side text,
  final_score text,
  completed_at timestamptz,
  vote_count bigint,
  rating_average numeric,
  rating_count bigint,
  proof_count bigint
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
    where challenge.result_share_token = target_share_token
      and challenge.status = 'Completed'
    limit 1
  )
  select
    challenge.title as challenge_title,
    challenge.lane as challenge_lane,
    challenge.sport_type,
    challenge.match_format,
    challenge.roster_size,
    challenge.booking_region,
    challenge.resolved_team_a as team_a_name,
    challenge.resolved_team_b as team_b_name,
    case
      when challenge.winner = challenge.team_a then challenge.resolved_team_a
      when challenge.winner = challenge.team_b then challenge.resolved_team_b
      else coalesce(nullif(challenge.winner, ''), 'Winner declared')
    end as winner_name,
    case
      when challenge.winner = challenge.team_a then 'Team A'
      when challenge.winner = challenge.team_b then 'Team B'
      else null
    end as winner_side,
    challenge.final_score,
    challenge.completed_at,
    (select count(*) from public.votes vote where vote.challenge_id = challenge.id) as vote_count,
    coalesce(
      (select round(avg(rating.rating)::numeric, 1) from public.ratings rating where rating.challenge_id = challenge.id),
      0::numeric
    ) as rating_average,
    (select count(*) from public.ratings rating where rating.challenge_id = challenge.id) as rating_count,
    (select count(*) from public.proofs proof where proof.challenge_id = challenge.id) as proof_count
  from resolved_challenge challenge;
$$;

revoke all on function public.get_challenge_result_preview(uuid) from public;
grant execute on function public.get_challenge_result_preview(uuid) to anon, authenticated;

commit;
