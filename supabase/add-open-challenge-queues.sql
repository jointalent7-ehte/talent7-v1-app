begin;

alter table public.challenges
add column if not exists opponent_entry_mode text not null default 'Direct join',
add column if not exists challenger_queue_limit integer not null default 10;

alter table public.challenges
drop constraint if exists challenges_opponent_entry_mode_check;

alter table public.challenges
add constraint challenges_opponent_entry_mode_check
check (opponent_entry_mode in ('Direct join', 'Request queue', 'Matched'));

alter table public.challenges
drop constraint if exists challenges_challenger_queue_limit_check;

alter table public.challenges
add constraint challenges_challenger_queue_limit_check
check (challenger_queue_limit between 1 and 50);

create table if not exists public.open_challenge_requests (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  requesting_team_id uuid not null references public.talent_teams(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  team_name text not null,
  message text,
  proposed_at timestamptz,
  status text not null default 'Pending'
    check (status in ('Pending', 'Accepted', 'Declined', 'Withdrawn', 'Expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists open_challenge_requests_one_active_team
on public.open_challenge_requests (challenge_id, requesting_team_id)
where status in ('Pending', 'Accepted');

create index if not exists open_challenge_requests_queue_order
on public.open_challenge_requests (challenge_id, status, created_at);

alter table public.open_challenge_requests enable row level security;

drop policy if exists "Public can read open challenge queues" on public.open_challenge_requests;
create policy "Public can read open challenge queues"
on public.open_challenge_requests for select
using (true);

revoke insert, update, delete on public.open_challenge_requests from anon, authenticated;
grant select on public.open_challenge_requests to anon, authenticated;

create or replace function public.user_can_manage_talent_team(target_team_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.talent_teams team
    where team.id = target_team_id
      and (
        team.owner_user_id = target_user_id
        or exists (
          select 1
          from public.team_join_requests membership
          where membership.team_id = team.id
            and membership.requester_user_id = target_user_id
            and membership.status = 'Accepted'
            and membership.member_role in ('Captain', 'Organizer')
        )
      )
  );
$$;

create or replace function public.user_belongs_to_talent_team(target_team_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.talent_teams team
    where team.id = target_team_id
      and (
        team.owner_user_id = target_user_id
        or exists (
          select 1
          from public.team_join_requests membership
          where membership.team_id = team.id
            and membership.requester_user_id = target_user_id
            and membership.status = 'Accepted'
        )
      )
  );
$$;

create or replace function public.submit_open_challenge_request(
  target_challenge_id uuid,
  target_team_id uuid,
  target_message text default null,
  target_proposed_at timestamptz default null
)
returns public.open_challenge_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  target_challenge public.challenges;
  target_team public.talent_teams;
  saved_request public.open_challenge_requests;
begin
  if acting_user is null then
    raise exception 'Authentication required';
  end if;

  select * into target_challenge
  from public.challenges
  where id = target_challenge_id
  for update;

  if target_challenge.id is null
     or target_challenge.status <> 'Open'
     or target_challenge.opponent_entry_mode <> 'Request queue'
     or target_challenge.team_b_id is not null then
    raise exception 'This challenge is not accepting team requests';
  end if;

  select * into target_team
  from public.talent_teams
  where id = target_team_id;

  if target_team.id is null then
    raise exception 'Team not found';
  end if;

  if target_challenge.team_a_id is null then
    raise exception 'The host must link a Talent7 team';
  end if;

  if target_team.id = target_challenge.team_a_id then
    raise exception 'The host team cannot challenge itself';
  end if;

  if not public.user_can_manage_talent_team(target_team.id, acting_user) then
    raise exception 'Only a team owner, captain, or organizer can submit this request';
  end if;

  if (
    select count(*)
    from public.open_challenge_requests request
    where request.challenge_id = target_challenge.id
      and request.status = 'Pending'
  ) >= target_challenge.challenger_queue_limit then
    raise exception 'This challenger queue is full';
  end if;

  insert into public.open_challenge_requests (
    challenge_id,
    requesting_team_id,
    requested_by,
    requester_name,
    team_name,
    message,
    proposed_at
  ) values (
    target_challenge.id,
    target_team.id,
    acting_user,
    coalesce(nullif(trim((select display_name from public.profiles where user_id = acting_user)), ''), 'Team captain'),
    target_team.name,
    nullif(trim(target_message), ''),
    target_proposed_at
  )
  returning * into saved_request;

  return saved_request;
end;
$$;

create or replace function public.respond_open_challenge_request(
  target_request_id uuid,
  target_status text
)
returns public.open_challenge_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  target_request public.open_challenge_requests;
  target_challenge public.challenges;
begin
  if acting_user is null then
    raise exception 'Authentication required';
  end if;

  if target_status not in ('Accepted', 'Declined') then
    raise exception 'Choose Accepted or Declined';
  end if;

  select * into target_request
  from public.open_challenge_requests
  where id = target_request_id
  for update;

  if target_request.id is null or target_request.status <> 'Pending' then
    raise exception 'This request is no longer pending';
  end if;

  select * into target_challenge
  from public.challenges
  where id = target_request.challenge_id
  for update;

  if target_challenge.created_by <> acting_user
     and not public.user_can_manage_talent_team(target_challenge.team_a_id, acting_user) then
    raise exception 'Only the host team owner, captain, or organizer can respond';
  end if;

  if target_status = 'Accepted' then
    if target_challenge.status <> 'Open'
       or target_challenge.opponent_entry_mode <> 'Request queue'
       or target_challenge.team_b_id is not null then
      raise exception 'This challenge already has an opponent';
    end if;

    update public.open_challenge_requests
    set status = 'Accepted', updated_at = now()
    where id = target_request.id
    returning * into target_request;

    update public.open_challenge_requests
    set status = 'Declined', updated_at = now()
    where challenge_id = target_request.challenge_id
      and id <> target_request.id
      and status = 'Pending';

    update public.challenges
    set team_b_id = target_request.requesting_team_id,
        team_b = target_request.team_name,
        opponent_entry_mode = 'Matched'
    where id = target_request.challenge_id;
  else
    update public.open_challenge_requests
    set status = 'Declined', updated_at = now()
    where id = target_request.id
    returning * into target_request;
  end if;

  return target_request;
end;
$$;

create or replace function public.withdraw_open_challenge_request(target_request_id uuid)
returns public.open_challenge_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  target_request public.open_challenge_requests;
begin
  if acting_user is null then
    raise exception 'Authentication required';
  end if;

  select * into target_request
  from public.open_challenge_requests
  where id = target_request_id
  for update;

  if target_request.id is null or target_request.status <> 'Pending' then
    raise exception 'This request is no longer pending';
  end if;

  if target_request.requested_by <> acting_user
     and not public.user_can_manage_talent_team(target_request.requesting_team_id, acting_user) then
    raise exception 'Only that team owner, captain, or organizer can withdraw this request';
  end if;

  update public.open_challenge_requests
  set status = 'Withdrawn', updated_at = now()
  where id = target_request.id
  returning * into target_request;

  return target_request;
end;
$$;

create or replace function public.enforce_queued_challenge_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_challenge public.challenges;
  target_team_id uuid;
begin
  if new.role <> 'Challenger' then
    return new;
  end if;

  select * into target_challenge
  from public.challenges
  where id = new.challenge_id;

  if target_challenge.opponent_entry_mode not in ('Request queue', 'Matched') then
    return new;
  end if;

  if new.side = 'Team B' and target_challenge.opponent_entry_mode = 'Request queue' then
    raise exception 'The host must accept a challenger before Team B can join';
  end if;

  target_team_id := case when new.side = 'Team B' then target_challenge.team_b_id else target_challenge.team_a_id end;

  if target_team_id is null or not public.user_belongs_to_talent_team(target_team_id, new.user_id) then
    raise exception 'Only members of the selected team can join this challenge side';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_queued_challenge_roster_trigger on public.challenge_joins;
create trigger enforce_queued_challenge_roster_trigger
before insert or update of role, side, user_id, challenge_id on public.challenge_joins
for each row execute function public.enforce_queued_challenge_roster();

revoke all on function public.user_can_manage_talent_team(uuid, uuid) from public;
revoke all on function public.user_belongs_to_talent_team(uuid, uuid) from public;
revoke all on function public.submit_open_challenge_request(uuid, uuid, text, timestamptz) from public;
revoke all on function public.respond_open_challenge_request(uuid, text) from public;
revoke all on function public.withdraw_open_challenge_request(uuid) from public;
grant execute on function public.submit_open_challenge_request(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.respond_open_challenge_request(uuid, text) to authenticated;
grant execute on function public.withdraw_open_challenge_request(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.open_challenge_requests;
exception
  when duplicate_object then null;
end $$;

commit;
