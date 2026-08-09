alter table public.challenges
add column if not exists voting_status text not null default 'Closed',
add column if not exists voting_opened_at timestamptz,
add column if not exists voting_closes_at timestamptz,
add column if not exists voting_closed_at timestamptz,
add column if not exists voting_updated_by uuid references auth.users(id) on delete set null;

alter table public.challenges
drop constraint if exists challenges_voting_status_check;

alter table public.challenges
add constraint challenges_voting_status_check
check (voting_status in ('Closed', 'Open'));

alter table public.challenges
drop constraint if exists challenges_voting_window_timeline;

alter table public.challenges
add constraint challenges_voting_window_timeline
check (
  voting_status = 'Closed'
  or (
    status <> 'Completed'
    and voting_opened_at is not null
    and (voting_closes_at is null or voting_closes_at > voting_opened_at)
    and voting_closed_at is null
  )
);

create index if not exists challenges_open_voting_idx
on public.challenges (voting_status, voting_closes_at)
where voting_status = 'Open';

create or replace function public.can_manage_challenge_voting(
  target_challenge_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id is not null and exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = target_user_id
        or exists (
          select 1 from public.app_admins
          where app_admins.user_id = target_user_id
        )
        or exists (
          select 1 from public.challenge_invites
          where challenge_invites.challenge_id = target_challenge_id
            and challenge_invites.invited_user_id = target_user_id
            and challenge_invites.status = 'Accepted'
        )
        or exists (
          select 1 from public.talent_teams
          where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
            and talent_teams.owner_user_id = target_user_id
        )
        or exists (
          select 1 from public.team_join_requests
          where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
            and team_join_requests.requester_user_id = target_user_id
            and team_join_requests.status = 'Accepted'
            and team_join_requests.member_role in ('Captain', 'Organizer')
        )
      )
  );
$$;

create or replace function public.set_challenge_voting_window(
  target_challenge_id uuid,
  target_action text,
  target_duration_minutes integer default null
)
returns setof public.challenges
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if not public.can_manage_challenge_voting(target_challenge_id, acting_user) then
    raise exception 'You do not have permission to manage voting in this room';
  end if;

  if target_action not in ('Open', 'Close') then
    raise exception 'Invalid voting action';
  end if;

  if target_action = 'Open'
     and target_duration_minutes is not null
     and (target_duration_minutes < 1 or target_duration_minutes > 1440) then
    raise exception 'Voting duration must be between 1 minute and 24 hours';
  end if;

  if target_action = 'Open' then
    update public.challenges
    set voting_status = 'Open',
        voting_opened_at = now(),
        voting_closes_at = case
          when target_duration_minutes is null then null
          else now() + make_interval(mins => target_duration_minutes)
        end,
        voting_closed_at = null,
        voting_updated_by = acting_user
    where id = target_challenge_id
      and status <> 'Completed';
  else
    update public.challenges
    set voting_status = 'Closed',
        voting_closed_at = now(),
        voting_updated_by = acting_user
    where id = target_challenge_id
      and status <> 'Completed';
  end if;

  return query
  select * from public.challenges where id = target_challenge_id;
end;
$$;

create or replace function public.close_challenge_voting_when_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    new.voting_status := 'Closed';
    new.voting_closed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists close_challenge_voting_on_completion on public.challenges;
create trigger close_challenge_voting_on_completion
before update of status on public.challenges
for each row execute function public.close_challenge_voting_when_completed();

drop policy if exists "Public can create votes during MVP" on public.votes;
drop policy if exists "Signed in can create votes" on public.votes;
drop policy if exists "Signed in can vote during an open voting window" on public.votes;

create policy "Signed in can vote during an open voting window"
on public.votes for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.challenges
    where challenges.id = votes.challenge_id
      and challenges.status <> 'Completed'
      and challenges.voting_status = 'Open'
      and (
        challenges.voting_closes_at is null
        or challenges.voting_closes_at > now()
      )
      and votes.winner in (challenges.team_a, challenges.team_b)
  )
);

revoke all on function public.can_manage_challenge_voting(uuid, uuid) from public;
revoke all on function public.set_challenge_voting_window(uuid, text, integer) from public;
revoke all on function public.close_challenge_voting_when_completed() from public;

grant execute on function public.can_manage_challenge_voting(uuid, uuid) to authenticated;
grant execute on function public.set_challenge_voting_window(uuid, text, integer) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenges'
  ) then
    alter publication supabase_realtime add table public.challenges;
  end if;
end;
$$;

comment on column public.challenges.voting_status is
  'Closed by default. Votes are accepted only while an organizer explicitly opens the room window.';

comment on function public.set_challenge_voting_window(uuid, text, integer) is
  'Permission-checked organizer control for opening timed/manual voting and closing it immediately.';
