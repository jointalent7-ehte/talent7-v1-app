create extension if not exists "uuid-ossp";

create table if not exists public.challenge_schedules (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  play_mode text not null default 'In person' check (play_mode in ('In person', 'Online')),
  venue_name text not null default '',
  meeting_details text not null default '',
  session_url text not null default '',
  note text not null default '',
  status text not null default 'Proposed' check (status in ('Proposed', 'Changes requested', 'Confirmed', 'Cancelled')),
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_schedules_timezone_length check (char_length(timezone) between 1 and 80),
  constraint challenge_schedules_venue_length check (char_length(venue_name) <= 160),
  constraint challenge_schedules_meeting_length check (char_length(meeting_details) <= 300),
  constraint challenge_schedules_url_length check (char_length(session_url) <= 500),
  constraint challenge_schedules_note_length check (char_length(note) <= 500),
  constraint challenge_schedules_url_format check (session_url = '' or session_url ~ '^https?://')
);

create index if not exists challenge_schedules_scheduled_for_idx
on public.challenge_schedules (scheduled_for);

create or replace function public.can_coordinate_challenge(target_challenge_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = target_user_id
        or exists (
          select 1
          from public.challenge_invites
          where challenge_invites.challenge_id = target_challenge_id
            and challenge_invites.invited_user_id = target_user_id
            and challenge_invites.status = 'Accepted'
        )
        or exists (
          select 1
          from public.challenge_joins
          where challenge_joins.challenge_id = target_challenge_id
            and challenge_joins.user_id = target_user_id
            and challenge_joins.role = 'Challenger'
        )
      )
  );
$$;

revoke all on function public.can_coordinate_challenge(uuid, uuid) from public;
grant execute on function public.can_coordinate_challenge(uuid, uuid) to authenticated;

create or replace function public.enforce_challenge_schedule_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  schedule_details_changed boolean;
begin
  if acting_user is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.proposed_by <> acting_user or new.status <> 'Proposed' or new.confirmed_by is not null then
      raise exception 'New schedules must be proposals made by the signed-in participant';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.challenge_id is distinct from old.challenge_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Schedule ownership fields cannot be changed';
  end if;

  schedule_details_changed := row(
    new.scheduled_for, new.timezone, new.play_mode, new.venue_name,
    new.meeting_details, new.session_url, new.note
  ) is distinct from row(
    old.scheduled_for, old.timezone, old.play_mode, old.venue_name,
    old.meeting_details, old.session_url, old.note
  );

  if new.status = 'Confirmed' then
    if old.status <> 'Proposed' or acting_user = old.proposed_by or schedule_details_changed then
      raise exception 'Only the other participant can confirm an unchanged proposal';
    end if;
    new.proposed_by := old.proposed_by;
    new.confirmed_by := acting_user;
  elsif new.status = 'Changes requested' then
    if old.status <> 'Proposed' or acting_user = old.proposed_by or schedule_details_changed then
      raise exception 'Only the other participant can request changes to the current proposal';
    end if;
    new.proposed_by := old.proposed_by;
    new.confirmed_by := null;
  elsif new.status = 'Proposed' then
    new.proposed_by := acting_user;
    new.confirmed_by := null;
  elsif new.status = 'Cancelled' then
    if schedule_details_changed then
      raise exception 'Schedule details cannot be changed while cancelling';
    end if;
    new.proposed_by := old.proposed_by;
    new.confirmed_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_challenge_schedule_changes_trigger on public.challenge_schedules;
create trigger enforce_challenge_schedule_changes_trigger
before insert or update on public.challenge_schedules
for each row execute function public.enforce_challenge_schedule_changes();

alter table public.challenge_schedules enable row level security;

drop policy if exists "Participants can read challenge schedules" on public.challenge_schedules;
drop policy if exists "Participants can propose challenge schedules" on public.challenge_schedules;
drop policy if exists "Participants can update challenge schedules" on public.challenge_schedules;

create policy "Participants can read challenge schedules"
on public.challenge_schedules for select
to authenticated
using (public.can_coordinate_challenge(challenge_id, auth.uid()));

create policy "Participants can propose challenge schedules"
on public.challenge_schedules for insert
to authenticated
with check (
  proposed_by = auth.uid()
  and public.can_coordinate_challenge(challenge_id, auth.uid())
);

create policy "Participants can update challenge schedules"
on public.challenge_schedules for update
to authenticated
using (public.can_coordinate_challenge(challenge_id, auth.uid()))
with check (public.can_coordinate_challenge(challenge_id, auth.uid()));
