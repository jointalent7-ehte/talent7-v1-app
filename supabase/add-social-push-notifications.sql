begin;

create or replace function public.enqueue_push_notification_once(
  target_user_id uuid,
  target_actor_user_id uuid,
  target_category text,
  target_title text,
  target_body text,
  target_href text,
  target_resource_type text,
  target_resource_id uuid,
  target_dedupe_window interval default interval '90 seconds'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_event_id uuid;
begin
  if target_user_id is null or target_user_id = target_actor_user_id then
    return null;
  end if;

  select event.id into existing_event_id
  from public.push_notification_events event
  where event.user_id = target_user_id
    and event.category = target_category
    and event.resource_type = target_resource_type
    and event.resource_id is not distinct from target_resource_id
    and event.created_at >= now() - greatest(target_dedupe_window, interval '0 seconds')
  order by event.created_at desc
  limit 1;

  if existing_event_id is not null then
    return existing_event_id;
  end if;

  return public.enqueue_push_notification(
    target_user_id,
    target_actor_user_id,
    target_category,
    target_title,
    target_body,
    target_href,
    target_resource_type,
    target_resource_id
  );
end;
$$;

create or replace function public.queue_profile_follow_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  follower_name text;
begin
  select coalesce(nullif(trim(profile.display_name), ''), 'Someone')
  into follower_name
  from public.profiles profile
  where profile.user_id = new.follower_id;

  perform public.enqueue_push_notification_once(
    new.following_id,
    new.follower_id,
    'Social',
    'New follower',
    coalesce(follower_name, 'Someone') || ' followed your Talent7 profile.',
    '#profiles',
    'profile_follow',
    new.id,
    interval '1 day'
  );

  return new;
end;
$$;

drop trigger if exists queue_profile_follow_push_trigger on public.profile_follows;
create trigger queue_profile_follow_push_trigger
after insert on public.profile_follows
for each row execute function public.queue_profile_follow_push();

create or replace function public.queue_followed_challenge_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  creator_name text;
  recipient record;
begin
  if new.created_by is null or new.status <> 'Open' then
    return new;
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'A creator you follow')
  into creator_name
  from public.profiles profile
  where profile.user_id = new.created_by;

  for recipient in
    select follow.follower_id as user_id
    from public.profile_follows follow
    where follow.following_id = new.created_by
  loop
    perform public.enqueue_push_notification_once(
      recipient.user_id,
      new.created_by,
      'Social',
      'New challenge from ' || coalesce(creator_name, 'someone you follow'),
      left(new.title, 180) || ' is open on Talent7.',
      '#room-' || new.id::text,
      'followed_challenge',
      new.id,
      interval '1 day'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists queue_followed_challenge_push_trigger on public.challenges;
create trigger queue_followed_challenge_push_trigger
after insert on public.challenges
for each row execute function public.queue_followed_challenge_push();

create or replace function public.queue_challenge_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_owner uuid;
  challenge_title text;
begin
  select challenge.created_by, challenge.title
  into challenge_owner, challenge_title
  from public.challenges challenge
  where challenge.id = new.challenge_id;

  perform public.enqueue_push_notification_once(
    challenge_owner,
    new.user_id,
    'Challenge update',
    'New reply in your challenge',
    coalesce(nullif(trim(new.author_name), ''), 'Someone') || ' replied in ' || coalesce(challenge_title, 'your challenge') || '.',
    '#room-' || new.challenge_id::text,
    'challenge_message',
    new.challenge_id,
    interval '90 seconds'
  );

  return new;
end;
$$;

drop trigger if exists queue_challenge_message_push_trigger on public.challenge_messages;
create trigger queue_challenge_message_push_trigger
after insert on public.challenge_messages
for each row execute function public.queue_challenge_message_push();

create or replace function public.queue_team_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_owner uuid;
  team_name text;
begin
  select team.owner_user_id, team.name
  into team_owner, team_name
  from public.talent_teams team
  where team.id = new.team_id;

  if tg_op = 'INSERT' then
    perform public.enqueue_push_notification_once(
      team_owner,
      new.requester_user_id,
      'Challenge invite',
      'New team request',
      new.requester_name || ' asked to join ' || coalesce(team_name, 'your team') || '.',
      '#team-' || new.team_id::text,
      'team_join_request',
      new.id,
      interval '1 day'
    );
  elsif new.status is distinct from old.status then
    perform public.enqueue_push_notification_once(
      new.requester_user_id,
      team_owner,
      'Challenge update',
      'Team request ' || lower(new.status),
      coalesce(team_name, 'The team') || ' ' || lower(new.status) || ' your request.',
      '#team-' || new.team_id::text,
      'team_join_request',
      new.id,
      interval '1 day'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_team_request_push_trigger on public.team_join_requests;
create trigger queue_team_request_push_trigger
after insert or update of status on public.team_join_requests
for each row execute function public.queue_team_request_push();

create or replace function public.queue_open_challenge_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_owner uuid;
  challenge_title text;
begin
  select challenge.created_by, challenge.title
  into challenge_owner, challenge_title
  from public.challenges challenge
  where challenge.id = new.challenge_id;

  if tg_op = 'INSERT' then
    perform public.enqueue_push_notification_once(
      challenge_owner,
      new.requested_by,
      'Challenge invite',
      'A team challenged you',
      new.team_name || ' requested the open spot in ' || coalesce(challenge_title, 'your challenge') || '.',
      '#room-' || new.challenge_id::text,
      'open_challenge_request',
      new.id,
      interval '1 day'
    );
  elsif new.status is distinct from old.status and new.status in ('Accepted', 'Declined', 'Expired') then
    perform public.enqueue_push_notification_once(
      new.requested_by,
      challenge_owner,
      'Challenge update',
      'Challenge request ' || lower(new.status),
      'Your request for ' || coalesce(challenge_title, 'the challenge') || ' was ' || lower(new.status) || '.',
      '#room-' || new.challenge_id::text,
      'open_challenge_request',
      new.id,
      interval '1 day'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_open_challenge_request_push_trigger on public.open_challenge_requests;
create trigger queue_open_challenge_request_push_trigger
after insert or update of status on public.open_challenge_requests
for each row execute function public.queue_open_challenge_request_push();

revoke all on function public.enqueue_push_notification_once(uuid, uuid, text, text, text, text, text, uuid, interval) from public;
revoke all on function public.queue_profile_follow_push() from public;
revoke all on function public.queue_followed_challenge_push() from public;
revoke all on function public.queue_challenge_message_push() from public;
revoke all on function public.queue_team_request_push() from public;
revoke all on function public.queue_open_challenge_request_push() from public;

comment on function public.enqueue_push_notification_once(uuid, uuid, text, text, text, text, text, uuid, interval) is
  'Queues one private push per user, category, resource, and short deduplication window.';

commit;
