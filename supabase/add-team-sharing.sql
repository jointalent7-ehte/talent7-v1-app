begin;

alter table public.talent_teams
add column if not exists share_token uuid;

update public.talent_teams
set share_token = gen_random_uuid()
where share_token is null;

alter table public.talent_teams
alter column share_token set default gen_random_uuid();

alter table public.talent_teams
alter column share_token set not null;

create unique index if not exists talent_teams_share_token_unique
on public.talent_teams (share_token);

create or replace function public.get_public_team_preview(target_share_token uuid)
returns table (
  team_name text,
  team_type text,
  main_activity text,
  region text,
  description text,
  owner_name text,
  created_at timestamptz,
  member_count bigint,
  challenge_count bigint,
  win_count bigint,
  proof_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    team.name as team_name,
    team.team_type,
    team.main_activity,
    team.region,
    team.description,
    coalesce(nullif(owner_profile.display_name, ''), 'Talent7 captain') as owner_name,
    team.created_at,
    1 + (
      select count(*)
      from public.team_join_requests team_request
      where team_request.team_id = team.id
        and team_request.status = 'Accepted'
    ) as member_count,
    (
      select count(*)
      from public.challenges challenge
      where (challenge.team_a_id = team.id or challenge.team_b_id = team.id)
        and challenge.status <> 'Cancelled'
    ) as challenge_count,
    (
      select count(*)
      from public.challenges challenge
      where challenge.status = 'Completed'
        and (
          (challenge.team_a_id = team.id and challenge.winner = challenge.team_a)
          or (challenge.team_b_id = team.id and challenge.winner = challenge.team_b)
        )
    ) as win_count,
    (
      select count(*)
      from public.proofs proof
      join public.challenges challenge on challenge.id = proof.challenge_id
      where challenge.team_a_id = team.id or challenge.team_b_id = team.id
    ) as proof_count
  from public.talent_teams team
  left join public.profiles owner_profile on owner_profile.user_id = team.owner_user_id
  where team.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_public_team_preview(uuid) from public;
grant execute on function public.get_public_team_preview(uuid) to anon, authenticated;

commit;
