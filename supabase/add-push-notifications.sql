create extension if not exists "uuid-ossp";

create table if not exists public.push_devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 32 and 4096),
  platform text not null check (platform in ('Android', 'Web')),
  device_name text check (device_name is null or char_length(device_name) <= 120),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_user_enabled_idx
on public.push_devices (user_id, enabled, last_seen_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  challenge_invites boolean not null default true,
  challenge_updates boolean not null default true,
  live_rooms boolean not null default true,
  voting_windows boolean not null default true,
  proof_results boolean not null default true,
  social_updates boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_notification_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  category text not null check (
    category in ('Challenge invite', 'Challenge update', 'Live room', 'Voting', 'Proof and result', 'Social')
  ),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 300),
  href text not null default '#notifications' check (char_length(href) between 1 and 240),
  resource_type text check (resource_type is null or char_length(resource_type) <= 60),
  resource_id uuid,
  delivered_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts between 0 and 20),
  last_delivery_error text check (last_delivery_error is null or char_length(last_delivery_error) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists push_notification_events_pending_idx
on public.push_notification_events (created_at)
where delivered_at is null;

create index if not exists push_notification_events_user_recent_idx
on public.push_notification_events (user_id, created_at desc);

alter table public.push_devices enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_notification_events enable row level security;

revoke all on public.push_devices from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;
revoke all on public.push_notification_events from anon, authenticated;

grant select, insert, update, delete on public.push_devices to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.push_notification_events to authenticated;

drop policy if exists "Users manage their own push devices" on public.push_devices;
create policy "Users manage their own push devices"
on public.push_devices for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read their own notification preferences" on public.notification_preferences;
drop policy if exists "Users create their own notification preferences" on public.notification_preferences;
drop policy if exists "Users update their own notification preferences" on public.notification_preferences;

create policy "Users read their own notification preferences"
on public.notification_preferences for select
to authenticated
using (auth.uid() = user_id);

create policy "Users create their own notification preferences"
on public.notification_preferences for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users update their own notification preferences"
on public.notification_preferences for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read their own push notification events" on public.push_notification_events;
create policy "Users read their own push notification events"
on public.push_notification_events for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.register_push_device(
  target_token text,
  target_platform text,
  target_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Log in before enabling push notifications';
  end if;

  if target_token is null or char_length(target_token) < 32 or char_length(target_token) > 4096 then
    raise exception 'Invalid push token';
  end if;

  if target_platform not in ('Android', 'Web') then
    raise exception 'Invalid push platform';
  end if;

  delete from public.push_devices
  where token = target_token
    and user_id <> acting_user;

  insert into public.push_devices (
    user_id,
    token,
    platform,
    device_name,
    enabled,
    last_seen_at,
    created_at,
    updated_at
  ) values (
    acting_user,
    target_token,
    target_platform,
    nullif(left(coalesce(target_device_name, ''), 120), ''),
    true,
    now(),
    now(),
    now()
  )
  on conflict (token) do update
  set user_id = acting_user,
      platform = excluded.platform,
      device_name = excluded.device_name,
      enabled = true,
      last_seen_at = now(),
      updated_at = now();
end;
$$;

create or replace function public.enqueue_push_notification(
  target_user_id uuid,
  target_actor_user_id uuid,
  target_category text,
  target_title text,
  target_body text,
  target_href text,
  target_resource_type text,
  target_resource_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_id uuid;
begin
  if target_user_id is null or target_user_id = target_actor_user_id then
    return null;
  end if;

  insert into public.push_notification_events (
    user_id,
    actor_user_id,
    category,
    title,
    body,
    href,
    resource_type,
    resource_id
  ) values (
    target_user_id,
    target_actor_user_id,
    target_category,
    target_title,
    target_body,
    coalesce(nullif(target_href, ''), '#notifications'),
    target_resource_type,
    target_resource_id
  ) returning id into event_id;

  return event_id;
end;
$$;

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
  ) recipients
  where recipients.user_id is not null;
$$;

create or replace function public.queue_challenge_invite_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_title text;
begin
  select title into challenge_title from public.challenges where id = new.challenge_id;

  if tg_op = 'INSERT' then
    perform public.enqueue_push_notification(
      new.invited_user_id,
      new.from_user_id,
      'Challenge invite',
      'New challenge invitation',
      'You were invited to ' || coalesce(challenge_title, 'a Talent7 challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status in ('Accepted', 'Declined') and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.from_user_id,
      new.invited_user_id,
      'Challenge update',
      'Challenge invitation ' || lower(new.status),
      new.invited_name || ' ' || lower(new.status) || ' the invitation to ' || coalesce(challenge_title, 'your challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status = 'Withdrawn' and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.invited_user_id,
      new.from_user_id,
      'Challenge update',
      'Challenge invitation withdrawn',
      'The challenger withdrew the invitation to ' || coalesce(challenge_title, 'a Talent7 challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status = 'Expired' and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.from_user_id,
      null,
      'Challenge update',
      'Challenge invitation expired',
      'Your invitation to ' || new.invited_name || ' expired before it was accepted.',
      '#invites',
      'challenge_invite',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists queue_challenge_invite_push_trigger on public.challenge_invites;
create trigger queue_challenge_invite_push_trigger
after insert or update of status on public.challenge_invites
for each row execute function public.queue_challenge_invite_push();

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
      '#challenges',
      'challenge',
      new.challenge_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists queue_challenge_live_push_trigger on public.challenge_live_sessions;
create trigger queue_challenge_live_push_trigger
after insert or update of status on public.challenge_live_sessions
for each row execute function public.queue_challenge_live_push();

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
      '#challenges',
      'challenge',
      new.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists queue_challenge_voting_push_trigger on public.challenges;
create trigger queue_challenge_voting_push_trigger
after update of voting_status on public.challenges
for each row execute function public.queue_challenge_voting_push();

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
      '#challenges',
      'challenge',
      new.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists queue_challenge_result_push_trigger on public.challenges;
create trigger queue_challenge_result_push_trigger
after update of status on public.challenges
for each row execute function public.queue_challenge_result_push();

revoke all on function public.enqueue_push_notification(uuid, uuid, text, text, text, text, text, uuid) from public;
revoke all on function public.register_push_device(text, text, text) from public;
revoke all on function public.challenge_push_recipients(uuid) from public;
revoke all on function public.queue_challenge_invite_push() from public;
revoke all on function public.queue_challenge_live_push() from public;
revoke all on function public.queue_challenge_voting_push() from public;
revoke all on function public.queue_challenge_result_push() from public;

grant execute on function public.register_push_device(text, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'push_notification_events'
  ) then
    alter publication supabase_realtime add table public.push_notification_events;
  end if;
end;
$$;

comment on table public.push_devices is
  'Private FCM registration tokens owned by an authenticated Talent7 user.';

comment on table public.push_notification_events is
  'Server-created notification outbox. A Supabase Database Webhook delivers each inserted row through the send-push Edge Function.';
