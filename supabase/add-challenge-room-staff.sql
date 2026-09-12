create extension if not exists "uuid-ossp";

create table if not exists public.challenge_room_staff (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null check (role in ('Judge', 'Camera operator', 'Moderator', 'Proof verifier', 'Scorekeeper')),
  assigned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_challenge_staff_role_per_user unique (challenge_id, user_id)
);

create unique index if not exists one_singleton_staff_role_per_challenge
on public.challenge_room_staff (challenge_id, role)
where role <> 'Judge';

create index if not exists challenge_room_staff_room_idx
on public.challenge_room_staff (challenge_id, role, created_at);

create table if not exists public.challenge_judge_scores (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  judge_user_id uuid not null references auth.users(id) on delete cascade,
  team_a_score integer not null check (team_a_score between 0 and 7),
  team_b_score integer not null check (team_b_score between 0 and 7),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_judge_score_per_room unique (challenge_id, judge_user_id)
);

create index if not exists challenge_judge_scores_room_idx
on public.challenge_judge_scores (challenge_id, created_at);

alter table public.challenge_room_staff enable row level security;
alter table public.challenge_judge_scores enable row level security;

revoke all on public.challenge_room_staff from anon, authenticated;
revoke all on public.challenge_judge_scores from anon, authenticated;
grant select on public.challenge_room_staff to anon, authenticated;
grant select on public.challenge_judge_scores to anon, authenticated;

drop policy if exists "Public can view challenge room staff" on public.challenge_room_staff;
create policy "Public can view challenge room staff"
on public.challenge_room_staff for select
to anon, authenticated
using (true);

drop policy if exists "Public can view challenge judge scores" on public.challenge_judge_scores;
create policy "Public can view challenge judge scores"
on public.challenge_judge_scores for select
to anon, authenticated
using (true);

create or replace function public.can_manage_challenge_room_staff(
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
      and challenges.status = 'Open'
      and (
        challenges.created_by = target_user_id
        or exists (
          select 1 from public.app_admins
          where app_admins.user_id = target_user_id
        )
      )
  );
$$;

create or replace function public.assign_challenge_room_staff(
  target_challenge_id uuid,
  target_username text,
  target_role text
)
returns setof public.challenge_room_staff
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  selected_user uuid;
  selected_display_name text;
  selected_staff_id uuid;
  existing_role text;
  judge_count integer;
begin
  if not public.can_manage_challenge_room_staff(target_challenge_id, acting_user) then
    raise exception 'Only the room creator or a Talent7 admin can assign room staff';
  end if;

  if target_role not in ('Judge', 'Camera operator', 'Moderator', 'Proof verifier', 'Scorekeeper') then
    raise exception 'Choose a valid room staff role';
  end if;

  perform 1
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  select profiles.user_id, profiles.display_name
  into selected_user, selected_display_name
  from public.profiles
  where lower(profiles.username) = lower(trim(both '@' from trim(target_username)))
  limit 1;

  if selected_user is null then
    raise exception 'No Talent7 profile was found for that username';
  end if;

  if exists (
    select 1 from public.challenges
    where challenges.id = target_challenge_id
      and challenges.created_by = selected_user
  ) then
    raise exception 'The room creator already has full room control';
  end if;

  select role into existing_role
  from public.challenge_room_staff
  where challenge_id = target_challenge_id
    and user_id = selected_user;

  if target_role = 'Judge' and coalesce(existing_role, '') <> 'Judge' then
    select count(*) into judge_count
    from public.challenge_room_staff
    where challenge_id = target_challenge_id
      and role = 'Judge';

    if judge_count >= 3 then
      raise exception 'This room already has the maximum of 3 judges';
    end if;
  end if;

  if target_role = 'Judge' and exists (
    select 1 from public.challenge_joins
    where challenge_joins.challenge_id = target_challenge_id
      and challenge_joins.user_id = selected_user
      and challenge_joins.role = 'Challenger'
  ) then
    raise exception 'A registered challenger cannot also judge the same room';
  end if;

  if target_role <> 'Judge' and exists (
    select 1 from public.challenge_room_staff
    where challenge_room_staff.challenge_id = target_challenge_id
      and challenge_room_staff.role = target_role
      and challenge_room_staff.user_id <> selected_user
  ) then
    raise exception 'That room role is already assigned';
  end if;

  if existing_role = 'Judge' and target_role <> 'Judge' then
    delete from public.challenge_judge_scores
    where challenge_id = target_challenge_id
      and judge_user_id = selected_user;
  end if;

  insert into public.challenge_room_staff (
    challenge_id,
    user_id,
    display_name,
    role,
    assigned_by
  ) values (
    target_challenge_id,
    selected_user,
    selected_display_name,
    target_role,
    acting_user
  )
  on conflict (challenge_id, user_id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      assigned_by = acting_user,
      updated_at = now()
  returning id into selected_staff_id;

  return query
  select * from public.challenge_room_staff where id = selected_staff_id;
end;
$$;

create or replace function public.remove_challenge_room_staff(target_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  selected_challenge_id uuid;
  selected_user_id uuid;
  selected_role text;
begin
  select challenge_id, user_id, role into selected_challenge_id, selected_user_id, selected_role
  from public.challenge_room_staff
  where id = target_staff_id;

  if selected_challenge_id is null then
    raise exception 'Room staff assignment not found';
  end if;

  if not public.can_manage_challenge_room_staff(selected_challenge_id, acting_user) then
    raise exception 'Only the room creator or a Talent7 admin can remove room staff';
  end if;

  delete from public.challenge_room_staff where id = target_staff_id;

  if selected_role = 'Judge' then
    delete from public.challenge_judge_scores
    where challenge_id = selected_challenge_id
      and judge_user_id = selected_user_id;
  end if;
end;
$$;

create or replace function public.submit_challenge_judge_score(
  target_challenge_id uuid,
  target_team_a_score integer,
  target_team_b_score integer,
  target_notes text default null
)
returns setof public.challenge_judge_scores
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Log in to submit a judge score';
  end if;

  if not exists (
    select 1
    from public.challenge_room_staff
    join public.challenges on challenges.id = challenge_room_staff.challenge_id
    where challenge_room_staff.challenge_id = target_challenge_id
      and challenge_room_staff.user_id = acting_user
      and challenge_room_staff.role = 'Judge'
      and challenges.status = 'Open'
  ) then
    raise exception 'Only an assigned judge can score this open room';
  end if;

  if target_team_a_score not between 0 and 7 or target_team_b_score not between 0 and 7 then
    raise exception 'Judge scores must be between 0 and 7';
  end if;

  insert into public.challenge_judge_scores (
    challenge_id,
    judge_user_id,
    team_a_score,
    team_b_score,
    notes
  ) values (
    target_challenge_id,
    acting_user,
    target_team_a_score,
    target_team_b_score,
    nullif(trim(target_notes), '')
  )
  on conflict (challenge_id, judge_user_id) do update
  set team_a_score = excluded.team_a_score,
      team_b_score = excluded.team_b_score,
      notes = excluded.notes,
      updated_at = now();

  return query
  select *
  from public.challenge_judge_scores
  where challenge_id = target_challenge_id
    and judge_user_id = acting_user;
end;
$$;

create or replace function public.review_challenge_proof(
  target_proof_id uuid,
  target_status text
)
returns setof public.proofs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  selected_challenge_id uuid;
begin
  if target_status not in ('Pending review', 'Accepted', 'Rejected') then
    raise exception 'Choose a valid proof review status';
  end if;

  select challenge_id into selected_challenge_id
  from public.proofs
  where id = target_proof_id;

  if selected_challenge_id is null then
    raise exception 'Proof not found';
  end if;

  if not exists (
    select 1 from public.challenges
    where challenges.id = selected_challenge_id
      and challenges.status = 'Open'
  ) then
    raise exception 'Proof review is closed for this room';
  end if;

  if not (
    public.can_manage_challenge_room_staff(selected_challenge_id, acting_user)
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_room_staff.challenge_id = selected_challenge_id
        and challenge_room_staff.user_id = acting_user
        and challenge_room_staff.role = 'Proof verifier'
    )
  ) then
    raise exception 'Only the proof verifier, room creator, or Talent7 admin can review proof';
  end if;

  update public.proofs
  set review_status = target_status
  where id = target_proof_id;

  return query select * from public.proofs where id = target_proof_id;
end;
$$;

create or replace function public.can_manage_challenge_live(
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
        or exists (select 1 from public.app_admins where app_admins.user_id = target_user_id)
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
        or exists (
          select 1 from public.challenge_room_staff
          where challenge_room_staff.challenge_id = target_challenge_id
            and challenge_room_staff.user_id = target_user_id
            and challenge_room_staff.role = 'Camera operator'
        )
      )
  );
$$;

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
        or exists (select 1 from public.app_admins where app_admins.user_id = target_user_id)
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
        or exists (
          select 1 from public.challenge_room_staff
          where challenge_room_staff.challenge_id = target_challenge_id
            and challenge_room_staff.user_id = target_user_id
            and challenge_room_staff.role = 'Moderator'
        )
      )
  );
$$;

drop policy if exists "Authorized users can complete challenges" on public.challenges;
create policy "Authorized users can complete challenges"
on public.challenges for update
to authenticated
using (
  status <> 'Completed'
  and (
    auth.uid() = created_by
    or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
    or exists (
      select 1 from public.talent_teams
      where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
        and talent_teams.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
        and team_join_requests.requester_user_id = auth.uid()
        and team_join_requests.status = 'Accepted'
        and team_join_requests.member_role in ('Captain', 'Organizer')
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_room_staff.challenge_id = challenges.id
        and challenge_room_staff.user_id = auth.uid()
        and challenge_room_staff.role = 'Scorekeeper'
    )
  )
)
with check (
  status = 'Completed'
  and completed_by = auth.uid()
  and completed_at is not null
  and winner in (team_a, team_b)
  and (
    auth.uid() = created_by
    or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
    or exists (
      select 1 from public.talent_teams
      where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
        and talent_teams.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
        and team_join_requests.requester_user_id = auth.uid()
        and team_join_requests.status = 'Accepted'
        and team_join_requests.member_role in ('Captain', 'Organizer')
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_room_staff.challenge_id = challenges.id
        and challenge_room_staff.user_id = auth.uid()
        and challenge_room_staff.role = 'Scorekeeper'
    )
  )
);

grant delete on public.challenge_messages to authenticated;

drop policy if exists "Challenge participants can read room messages" on public.challenge_messages;
create policy "Challenge participants can read room messages"
on public.challenge_messages for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.challenges
    where challenges.id = challenge_messages.challenge_id
      and challenges.created_by = auth.uid()
  )
  or exists (
    select 1 from public.challenge_joins
    where challenge_joins.challenge_id = challenge_messages.challenge_id
      and challenge_joins.user_id = auth.uid()
  )
  or exists (
    select 1 from public.challenge_room_staff
    where challenge_room_staff.challenge_id = challenge_messages.challenge_id
      and challenge_room_staff.user_id = auth.uid()
  )
);

drop policy if exists "Challenge participants can create room messages" on public.challenge_messages;
create policy "Challenge participants can create room messages"
on public.challenge_messages for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenges
    where challenges.id = challenge_messages.challenge_id
      and challenges.status <> 'Completed'
  )
  and (
    exists (
      select 1 from public.challenges
      where challenges.id = challenge_messages.challenge_id
        and challenges.created_by = auth.uid()
    )
    or exists (
      select 1 from public.challenge_joins
      where challenge_joins.challenge_id = challenge_messages.challenge_id
        and challenge_joins.user_id = auth.uid()
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_room_staff.challenge_id = challenge_messages.challenge_id
        and challenge_room_staff.user_id = auth.uid()
    )
  )
);

drop policy if exists "Authors and room moderators can delete room messages" on public.challenge_messages;
create policy "Authors and room moderators can delete room messages"
on public.challenge_messages for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
  or exists (
    select 1 from public.challenges
    where challenges.id = challenge_messages.challenge_id
      and challenges.created_by = auth.uid()
  )
  or exists (
    select 1 from public.challenge_room_staff
    where challenge_room_staff.challenge_id = challenge_messages.challenge_id
      and challenge_room_staff.user_id = auth.uid()
      and challenge_room_staff.role = 'Moderator'
  )
);

revoke all on function public.can_manage_challenge_room_staff(uuid, uuid) from public;
revoke all on function public.assign_challenge_room_staff(uuid, text, text) from public;
revoke all on function public.remove_challenge_room_staff(uuid) from public;
revoke all on function public.submit_challenge_judge_score(uuid, integer, integer, text) from public;
revoke all on function public.review_challenge_proof(uuid, text) from public;

grant execute on function public.can_manage_challenge_room_staff(uuid, uuid) to authenticated;
grant execute on function public.assign_challenge_room_staff(uuid, text, text) to authenticated;
grant execute on function public.remove_challenge_room_staff(uuid) to authenticated;
grant execute on function public.submit_challenge_judge_score(uuid, integer, integer, text) to authenticated;
grant execute on function public.review_challenge_proof(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.challenge_room_staff;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_judge_scores;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_messages;
exception
  when duplicate_object then null;
end $$;
