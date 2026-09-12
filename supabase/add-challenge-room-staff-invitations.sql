alter table public.challenge_room_staff
add column if not exists status text;

alter table public.challenge_room_staff
add column if not exists responded_at timestamptz;

-- Assignments created before this consent flow were already active. Preserve them.
update public.challenge_room_staff
set status = 'Accepted',
    responded_at = coalesce(responded_at, updated_at)
where status is null;

alter table public.challenge_room_staff
alter column status set default 'Pending';

alter table public.challenge_room_staff
alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.challenge_room_staff'::regclass
      and conname = 'challenge_room_staff_status_check'
  ) then
    alter table public.challenge_room_staff
    add constraint challenge_room_staff_status_check
    check (status in ('Pending', 'Accepted', 'Declined'));
  end if;
end $$;

drop index if exists public.one_singleton_staff_role_per_challenge;
create unique index one_singleton_staff_role_per_challenge
on public.challenge_room_staff (challenge_id, role)
where role <> 'Judge' and status in ('Pending', 'Accepted');

create index if not exists challenge_room_staff_invitee_status_idx
on public.challenge_room_staff (user_id, status, updated_at desc);

drop policy if exists "Public can view challenge room staff" on public.challenge_room_staff;
drop policy if exists "Relevant users can view challenge room staff" on public.challenge_room_staff;
create policy "Relevant users can view challenge room staff"
on public.challenge_room_staff for select
to anon, authenticated
using (
  status = 'Accepted'
  or user_id = auth.uid()
  or assigned_by = auth.uid()
  or exists (
    select 1
    from public.challenges
    where challenges.id = challenge_room_staff.challenge_id
      and challenges.created_by = auth.uid()
  )
  or exists (
    select 1 from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

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
  existing_status text;
  judge_count integer;
  challenge_title text;
begin
  if not public.can_manage_challenge_room_staff(target_challenge_id, acting_user) then
    raise exception 'Only the room creator or a Talent7 admin can invite room officials';
  end if;

  if target_role not in ('Judge', 'Camera operator', 'Moderator', 'Proof verifier', 'Scorekeeper') then
    raise exception 'Choose a valid room official role';
  end if;

  select title into challenge_title
  from public.challenges
  where id = target_challenge_id
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

  select role, status into existing_role, existing_status
  from public.challenge_room_staff
  where challenge_id = target_challenge_id
    and user_id = selected_user;

  if target_role = 'Judge'
     and not (coalesce(existing_role, '') = 'Judge' and coalesce(existing_status, '') in ('Pending', 'Accepted')) then
    select count(*) into judge_count
    from public.challenge_room_staff
    where challenge_id = target_challenge_id
      and role = 'Judge'
      and status in ('Pending', 'Accepted');

    if judge_count >= 3 then
      raise exception 'This room already has the maximum of 3 pending or accepted judges';
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
      and challenge_room_staff.status in ('Pending', 'Accepted')
  ) then
    raise exception 'That room role already has a pending or accepted official';
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
    assigned_by,
    status,
    responded_at
  ) values (
    target_challenge_id,
    selected_user,
    selected_display_name,
    target_role,
    acting_user,
    'Pending',
    null
  )
  on conflict (challenge_id, user_id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      assigned_by = acting_user,
      status = 'Pending',
      responded_at = null,
      updated_at = now()
  returning id into selected_staff_id;

  perform public.enqueue_push_notification(
    selected_user,
    acting_user,
    'Challenge update',
    'Room official invitation',
    'You were invited to be ' || target_role || ' for ' || coalesce(challenge_title, 'a Talent7 challenge') || '. Accept before official access is enabled.',
    '#room-' || target_challenge_id::text,
    'challenge_room_staff',
    selected_staff_id
  );

  return query
  select * from public.challenge_room_staff where id = selected_staff_id;
end;
$$;

create or replace function public.respond_challenge_room_staff_invitation(
  target_staff_id uuid,
  target_status text
)
returns setof public.challenge_room_staff
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  selected_staff public.challenge_room_staff%rowtype;
  challenge_title text;
  judge_count integer;
begin
  if acting_user is null then
    raise exception 'Log in to respond to this room official invitation';
  end if;

  if target_status not in ('Accepted', 'Declined') then
    raise exception 'Choose Accept or Decline';
  end if;

  select * into selected_staff
  from public.challenge_room_staff
  where id = target_staff_id
  for update;

  if selected_staff.id is null or selected_staff.user_id <> acting_user then
    raise exception 'This room official invitation is not assigned to you';
  end if;

  if selected_staff.status <> 'Pending' then
    raise exception 'This room official invitation has already been answered';
  end if;

  select title into challenge_title
  from public.challenges
  where id = selected_staff.challenge_id
    and status = 'Open'
  for update;

  if challenge_title is null then
    raise exception 'This room is no longer open for official assignments';
  end if;

  if target_status = 'Accepted' and selected_staff.role = 'Judge' then
    if exists (
      select 1 from public.challenge_joins
      where challenge_joins.challenge_id = selected_staff.challenge_id
        and challenge_joins.user_id = acting_user
        and challenge_joins.role = 'Challenger'
    ) then
      raise exception 'A registered challenger cannot also judge the same room';
    end if;

    select count(*) into judge_count
    from public.challenge_room_staff
    where challenge_id = selected_staff.challenge_id
      and role = 'Judge'
      and status = 'Accepted'
      and id <> selected_staff.id;

    if judge_count >= 3 then
      raise exception 'This room already has the maximum of 3 accepted judges';
    end if;
  end if;

  update public.challenge_room_staff
  set status = target_status,
      responded_at = now(),
      updated_at = now()
  where id = selected_staff.id;

  if target_status = 'Declined' and selected_staff.role = 'Judge' then
    delete from public.challenge_judge_scores
    where challenge_id = selected_staff.challenge_id
      and judge_user_id = acting_user;
  end if;

  perform public.enqueue_push_notification(
    selected_staff.assigned_by,
    acting_user,
    'Challenge update',
    'Room official invitation ' || lower(target_status),
    selected_staff.display_name || ' ' || lower(target_status) || ' the ' || selected_staff.role || ' invitation for ' || challenge_title || '.',
    '#room-' || selected_staff.challenge_id::text,
    'challenge_room_staff',
    selected_staff.id
  );

  return query
  select * from public.challenge_room_staff where id = selected_staff.id;
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
      and challenge_room_staff.status = 'Accepted'
      and challenges.status = 'Open'
  ) then
    raise exception 'Only a judge who accepted the invitation can score this open room';
  end if;

  if target_team_a_score not between 0 and 7 or target_team_b_score not between 0 and 7 then
    raise exception 'Judge scores must be between 0 and 7';
  end if;

  insert into public.challenge_judge_scores (
    challenge_id, judge_user_id, team_a_score, team_b_score, notes
  ) values (
    target_challenge_id, acting_user, target_team_a_score, target_team_b_score, nullif(trim(target_notes), '')
  )
  on conflict (challenge_id, judge_user_id) do update
  set team_a_score = excluded.team_a_score,
      team_b_score = excluded.team_b_score,
      notes = excluded.notes,
      updated_at = now();

  return query
  select * from public.challenge_judge_scores
  where challenge_id = target_challenge_id and judge_user_id = acting_user;
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

  select challenge_id into selected_challenge_id from public.proofs where id = target_proof_id;
  if selected_challenge_id is null then raise exception 'Proof not found'; end if;

  if not exists (
    select 1 from public.challenges
    where id = selected_challenge_id and status = 'Open'
  ) then
    raise exception 'Proof review is closed for this room';
  end if;

  if not (
    public.can_manage_challenge_room_staff(selected_challenge_id, acting_user)
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_id = selected_challenge_id
        and user_id = acting_user
        and role = 'Proof verifier'
        and status = 'Accepted'
    )
  ) then
    raise exception 'Only the accepted proof verifier, room creator, or Talent7 admin can review proof';
  end if;

  update public.proofs set review_status = target_status where id = target_proof_id;
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
    select 1 from public.challenges
    where challenges.id = target_challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = target_user_id
        or exists (select 1 from public.app_admins where app_admins.user_id = target_user_id)
        or exists (
          select 1 from public.challenge_invites
          where challenge_id = target_challenge_id
            and invited_user_id = target_user_id
            and status = 'Accepted'
        )
        or exists (
          select 1 from public.talent_teams
          where id in (challenges.team_a_id, challenges.team_b_id)
            and owner_user_id = target_user_id
        )
        or exists (
          select 1 from public.team_join_requests
          where team_id in (challenges.team_a_id, challenges.team_b_id)
            and requester_user_id = target_user_id
            and status = 'Accepted'
            and member_role in ('Captain', 'Organizer')
        )
        or exists (
          select 1 from public.challenge_room_staff
          where challenge_id = target_challenge_id
            and user_id = target_user_id
            and role = 'Camera operator'
            and status = 'Accepted'
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
    select 1 from public.challenges
    where challenges.id = target_challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = target_user_id
        or exists (select 1 from public.app_admins where app_admins.user_id = target_user_id)
        or exists (
          select 1 from public.challenge_invites
          where challenge_id = target_challenge_id
            and invited_user_id = target_user_id
            and status = 'Accepted'
        )
        or exists (
          select 1 from public.talent_teams
          where id in (challenges.team_a_id, challenges.team_b_id)
            and owner_user_id = target_user_id
        )
        or exists (
          select 1 from public.team_join_requests
          where team_id in (challenges.team_a_id, challenges.team_b_id)
            and requester_user_id = target_user_id
            and status = 'Accepted'
            and member_role in ('Captain', 'Organizer')
        )
        or exists (
          select 1 from public.challenge_room_staff
          where challenge_id = target_challenge_id
            and user_id = target_user_id
            and role = 'Moderator'
            and status = 'Accepted'
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
      where id in (challenges.team_a_id, challenges.team_b_id)
        and owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_id in (challenges.team_a_id, challenges.team_b_id)
        and requester_user_id = auth.uid()
        and status = 'Accepted'
        and member_role in ('Captain', 'Organizer')
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_id = challenges.id
        and user_id = auth.uid()
        and role = 'Scorekeeper'
        and status = 'Accepted'
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
      where id in (challenges.team_a_id, challenges.team_b_id)
        and owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_id in (challenges.team_a_id, challenges.team_b_id)
        and requester_user_id = auth.uid()
        and status = 'Accepted'
        and member_role in ('Captain', 'Organizer')
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_id = challenges.id
        and user_id = auth.uid()
        and role = 'Scorekeeper'
        and status = 'Accepted'
    )
  )
);

drop policy if exists "Challenge participants can read room messages" on public.challenge_messages;
create policy "Challenge participants can read room messages"
on public.challenge_messages for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.challenges
    where id = challenge_messages.challenge_id and created_by = auth.uid()
  )
  or exists (
    select 1 from public.challenge_joins
    where challenge_id = challenge_messages.challenge_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.challenge_room_staff
    where challenge_id = challenge_messages.challenge_id
      and user_id = auth.uid()
      and status = 'Accepted'
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
    where id = challenge_messages.challenge_id and status <> 'Completed'
  )
  and (
    exists (
      select 1 from public.challenges
      where id = challenge_messages.challenge_id and created_by = auth.uid()
    )
    or exists (
      select 1 from public.challenge_joins
      where challenge_id = challenge_messages.challenge_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.challenge_room_staff
      where challenge_id = challenge_messages.challenge_id
        and user_id = auth.uid()
        and status = 'Accepted'
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
    where id = challenge_messages.challenge_id and created_by = auth.uid()
  )
  or exists (
    select 1 from public.challenge_room_staff
    where challenge_id = challenge_messages.challenge_id
      and user_id = auth.uid()
      and role = 'Moderator'
      and status = 'Accepted'
  )
);

revoke all on function public.respond_challenge_room_staff_invitation(uuid, text) from public;
grant execute on function public.respond_challenge_room_staff_invitation(uuid, text) to authenticated;

comment on column public.challenge_room_staff.status is
  'Pending invitations grant no official powers. Powers activate only after the invited user accepts.';
