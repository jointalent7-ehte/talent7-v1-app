begin;

alter table public.challenges
add column if not exists cancellation_reason text,
add column if not exists cancelled_at timestamptz,
add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

alter table public.challenges
drop constraint if exists challenges_cancellation_reason_length_check;

alter table public.challenges
add constraint challenges_cancellation_reason_length_check
check (
  cancellation_reason is null
  or char_length(btrim(cancellation_reason)) between 5 and 280
) not valid;

create or replace function public.cancel_challenge_room(
  target_challenge_id uuid,
  target_reason text
)
returns setof public.challenges
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  room public.challenges%rowtype;
  clean_reason text := btrim(coalesce(target_reason, ''));
  recipient record;
begin
  if caller_id is null then
    raise exception 'Log in before cancelling a challenge room';
  end if;

  if char_length(clean_reason) < 5 or char_length(clean_reason) > 280 then
    raise exception 'Cancellation reason must be between 5 and 280 characters';
  end if;

  select * into room
  from public.challenges
  where id = target_challenge_id
  for update;

  if room.id is null then
    raise exception 'Challenge room not found';
  end if;

  if room.status <> 'Open' then
    raise exception 'Only an open challenge room can be cancelled';
  end if;

  if room.created_by is distinct from caller_id
    and not exists (
      select 1 from public.app_admins
      where app_admins.user_id = caller_id
    )
  then
    raise exception 'Only the room creator or a Talent7 admin can cancel this room';
  end if;

  update public.challenges
  set
    status = 'Cancelled',
    cancellation_reason = clean_reason,
    cancelled_at = now(),
    cancelled_by = caller_id
  where id = target_challenge_id
  returning * into room;

  update public.challenge_schedules
  set
    status = 'Cancelled',
    confirmed_by = null,
    updated_at = now()
  where challenge_id = target_challenge_id
    and status <> 'Cancelled';

  -- Pending invitations are no longer actionable. Their existing trigger sends
  -- the invite-specific withdrawal notice; accepted participants receive the
  -- room cancellation notice below.
  update public.challenge_invites
  set
    status = 'Withdrawn',
    updated_at = now()
  where challenge_id = target_challenge_id
    and status = 'Pending';

  for recipient in
    select distinct recipients.user_id
    from (
      select room.created_by as user_id
      union all
      select challenge_joins.user_id
      from public.challenge_joins
      where challenge_joins.challenge_id = target_challenge_id
      union all
      select challenge_invites.invited_user_id
      from public.challenge_invites
      where challenge_invites.challenge_id = target_challenge_id
        and challenge_invites.status = 'Accepted'
      union all
      select challenge_room_staff.user_id
      from public.challenge_room_staff
      where challenge_room_staff.challenge_id = target_challenge_id
        and challenge_room_staff.status in ('Pending', 'Accepted')
      union all
      select challenge_room_saves.user_id
      from public.challenge_room_saves
      where challenge_room_saves.challenge_id = target_challenge_id
    ) recipients
    where recipients.user_id is not null
  loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      caller_id,
      'Challenge update',
      'Challenge room cancelled',
      room.title || ' was cancelled. Reason: ' || clean_reason,
      '#room-' || target_challenge_id::text,
      'challenge',
      target_challenge_id
    );
  end loop;

  return next room;
end;
$$;

revoke all on function public.cancel_challenge_room(uuid, text) from public;
grant execute on function public.cancel_challenge_room(uuid, text) to authenticated;

comment on function public.cancel_challenge_room(uuid, text) is
  'Cancels an open challenge without deleting history, records a public reason, closes schedules and pending invitations, and notifies affected members.';

commit;
