create or replace function public.challenge_push_recipients(target_challenge_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct recipients.user_id
  from (
    select challenges.created_by as user_id
    from public.challenges
    where challenges.id = target_challenge_id

    union all

    select challenge_invites.invited_user_id
    from public.challenge_invites
    where challenge_invites.challenge_id = target_challenge_id
      and challenge_invites.status = 'Accepted'

    union all

    select challenge_joins.user_id
    from public.challenge_joins
    where challenge_joins.challenge_id = target_challenge_id

    union all

    select challenge_room_saves.user_id
    from public.challenge_room_saves
    where challenge_room_saves.challenge_id = target_challenge_id
  ) recipients
  where recipients.user_id is not null;
$$;

create or replace function public.queue_challenge_live_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_title text;
  recipient record;
begin
  if new.status <> 'Live' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'Live' then
    return new;
  end if;

  select title into challenge_title from public.challenges where id = new.challenge_id;

  for recipient in select user_id from public.challenge_push_recipients(new.challenge_id) loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      new.updated_by,
      'Live room',
      'A challenge is live now',
      coalesce(challenge_title, 'A Talent7 challenge') || ' just went live.',
      '#room-' || new.challenge_id::text,
      'challenge',
      new.challenge_id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.queue_challenge_voting_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
begin
  if new.voting_status <> 'Open' or old.voting_status = 'Open' then
    return new;
  end if;

  for recipient in select user_id from public.challenge_push_recipients(new.id) loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      new.voting_updated_by,
      'Voting',
      'Voting is open',
      'Voting has opened for ' || new.title || '.',
      '#room-' || new.id::text,
      'challenge',
      new.id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.queue_challenge_result_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
  actor_user uuid;
begin
  if new.status <> 'Completed' or old.status = 'Completed' then
    return new;
  end if;

  actor_user := coalesce(new.completed_by, new.created_by);

  for recipient in select user_id from public.challenge_push_recipients(new.id) loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      actor_user,
      'Proof and result',
      'Challenge completed',
      new.title || ' has been completed. Review the result and proof.',
      '#room-' || new.id::text,
      'challenge',
      new.id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.queue_saved_room_proof_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_title text;
  recipient record;
begin
  select title into challenge_title from public.challenges where id = new.challenge_id;

  for recipient in
    select challenge_room_saves.user_id
    from public.challenge_room_saves
    where challenge_room_saves.challenge_id = new.challenge_id
  loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      new.user_id,
      'Proof and result',
      'Proof added to a saved room',
      coalesce(challenge_title, 'A saved Talent7 challenge') || ' has new proof.',
      '#room-' || new.challenge_id::text,
      'challenge',
      new.challenge_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists queue_saved_room_proof_push_trigger on public.proofs;
create trigger queue_saved_room_proof_push_trigger
after insert on public.proofs
for each row execute function public.queue_saved_room_proof_push();

revoke all on function public.challenge_push_recipients(uuid) from public;
revoke all on function public.queue_challenge_live_push() from public;
revoke all on function public.queue_challenge_voting_push() from public;
revoke all on function public.queue_challenge_result_push() from public;
revoke all on function public.queue_saved_room_proof_push() from public;

comment on function public.challenge_push_recipients(uuid) is
  'Returns distinct challenge participants and users who privately saved the room.';

comment on function public.queue_saved_room_proof_push() is
  'Queues proof notifications for users who saved the affected challenge room.';
