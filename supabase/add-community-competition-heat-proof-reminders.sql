-- Talent7 participant check-in, heat proof review, and scheduled reminders.
-- Run after add-community-competition-heat-operations.sql.

begin;

create table if not exists public.talent7_competition_heat_proofs (
  id uuid primary key default uuid_generate_v4(),
  heat_entry_id uuid not null unique references public.talent7_competition_heat_entries(id) on delete cascade,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  proof_type text not null check (proof_type in ('Video', 'Image', 'Link')),
  proof_url text not null,
  notes text,
  review_status text not null default 'Pending'
    check (review_status in ('Pending', 'Accepted', 'Rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  retention_expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(proof_url) between 8 and 2000),
  check (notes is null or char_length(notes) <= 500),
  check (review_note is null or char_length(review_note) <= 500)
);

create index if not exists talent7_competition_heat_proofs_review_idx
on public.talent7_competition_heat_proofs (review_status, created_at);

create table if not exists public.talent7_competition_heat_reminders (
  id uuid primary key default uuid_generate_v4(),
  heat_entry_id uuid not null references public.talent7_competition_heat_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_kind text not null
    check (reminder_kind in ('Assignment', '24 hours', '1 hour', 'Check-in')),
  due_at timestamptz not null,
  push_event_id uuid references public.push_notification_events(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (heat_entry_id, reminder_kind)
);

create index if not exists talent7_competition_heat_reminders_due_idx
on public.talent7_competition_heat_reminders (due_at)
where sent_at is null;

alter table public.talent7_competition_heat_proofs enable row level security;
alter table public.talent7_competition_heat_reminders enable row level security;
revoke all on public.talent7_competition_heat_proofs from anon, authenticated;
revoke all on public.talent7_competition_heat_reminders from anon, authenticated;

create or replace function public.schedule_talent7_competition_heat_reminders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user_id uuid;
  target_start timestamptz;
begin
  select registration.user_id, heat.scheduled_start
  into target_user_id, target_start
  from public.talent7_competition_registrations registration
  join public.talent7_competition_heats heat on heat.id = new.heat_id
  where registration.id = new.registration_id;

  if target_user_id is null or target_start is null then return new; end if;

  insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
  values (new.id, target_user_id, 'Assignment', now())
  on conflict (heat_entry_id, reminder_kind) do nothing;

  if target_start > now() + interval '12 hours' then
    insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
    values (new.id, target_user_id, '24 hours', greatest(now(), target_start - interval '24 hours'))
    on conflict (heat_entry_id, reminder_kind) do nothing;
  end if;

  if target_start > now() + interval '20 minutes' then
    insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
    values (new.id, target_user_id, '1 hour', greatest(now(), target_start - interval '1 hour'))
    on conflict (heat_entry_id, reminder_kind) do nothing;
  end if;

  if target_start > now() + interval '5 minutes' then
    insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
    values (new.id, target_user_id, 'Check-in', greatest(now(), target_start - interval '30 minutes'))
    on conflict (heat_entry_id, reminder_kind) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists schedule_talent7_competition_heat_reminders_trigger
on public.talent7_competition_heat_entries;
create trigger schedule_talent7_competition_heat_reminders_trigger
after insert on public.talent7_competition_heat_entries
for each row execute function public.schedule_talent7_competition_heat_reminders();

-- Backfill reminder schedules for heats generated before this migration.
insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
select entry.id, registration.user_id, 'Assignment', now()
from public.talent7_competition_heat_entries entry
join public.talent7_competition_heats heat on heat.id = entry.heat_id
join public.talent7_competition_registrations registration on registration.id = entry.registration_id
where heat.status not in ('Final', 'Cancelled')
on conflict (heat_entry_id, reminder_kind) do nothing;

insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
select entry.id, registration.user_id, '24 hours', greatest(now(), heat.scheduled_start - interval '24 hours')
from public.talent7_competition_heat_entries entry
join public.talent7_competition_heats heat on heat.id = entry.heat_id
join public.talent7_competition_registrations registration on registration.id = entry.registration_id
where heat.status not in ('Final', 'Cancelled')
  and heat.scheduled_start > now() + interval '12 hours'
on conflict (heat_entry_id, reminder_kind) do nothing;

insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
select entry.id, registration.user_id, '1 hour', greatest(now(), heat.scheduled_start - interval '1 hour')
from public.talent7_competition_heat_entries entry
join public.talent7_competition_heats heat on heat.id = entry.heat_id
join public.talent7_competition_registrations registration on registration.id = entry.registration_id
where heat.status not in ('Final', 'Cancelled')
  and heat.scheduled_start > now() + interval '20 minutes'
on conflict (heat_entry_id, reminder_kind) do nothing;

insert into public.talent7_competition_heat_reminders (heat_entry_id, user_id, reminder_kind, due_at)
select entry.id, registration.user_id, 'Check-in', greatest(now(), heat.scheduled_start - interval '30 minutes')
from public.talent7_competition_heat_entries entry
join public.talent7_competition_heats heat on heat.id = entry.heat_id
join public.talent7_competition_registrations registration on registration.id = entry.registration_id
where heat.status not in ('Final', 'Cancelled')
  and heat.scheduled_start > now() + interval '5 minutes'
on conflict (heat_entry_id, reminder_kind) do nothing;

create or replace function public.queue_due_talent7_competition_heat_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reminder record;
  target_event_id uuid;
  queued_count integer := 0;
begin
  for reminder in
    select
      scheduled.id,
      scheduled.reminder_kind,
      scheduled.user_id,
      heat.id as heat_id,
      heat.cohort_number,
      heat.heat_number,
      heat.stage_number,
      heat.scheduled_start,
      entry.lane_number
    from public.talent7_competition_heat_reminders scheduled
    join public.talent7_competition_heat_entries entry on entry.id = scheduled.heat_entry_id
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where scheduled.sent_at is null
      and scheduled.due_at <= now()
      and heat.status not in ('Final', 'Cancelled')
      and registration.status = 'Confirmed'
    order by scheduled.due_at
    for update of scheduled skip locked
  loop
    target_event_id := public.enqueue_push_notification(
      reminder.user_id,
      null,
      case when reminder.reminder_kind = 'Check-in' then 'Live room' else 'Challenge update' end,
      case
        when reminder.reminder_kind = 'Assignment' then 'Your competition heat is ready'
        when reminder.reminder_kind = '24 hours' then 'Your Talent7 heat is tomorrow'
        when reminder.reminder_kind = '1 hour' then 'Your Talent7 heat starts in about one hour'
        else 'Check-in is open for your heat'
      end,
      case
        when reminder.reminder_kind = 'Assignment' then
          'Cohort ' || reminder.cohort_number || ', heat ' || reminder.heat_number || ', lane ' || reminder.lane_number || ' has been assigned.'
        when reminder.reminder_kind = 'Check-in' then
          'Open Talent7 and check in for heat ' || reminder.heat_number || ' on stage ' || reminder.stage_number || '.'
        else
          'Heat ' || reminder.heat_number || ', lane ' || reminder.lane_number || ' starts ' || to_char(reminder.scheduled_start, 'Mon DD at HH12:MI AM TZ') || '.'
      end,
      '#community-competition',
      'competition_heat',
      reminder.heat_id
    );

    update public.talent7_competition_heat_reminders
    set sent_at = now(), push_event_id = target_event_id
    where id = reminder.id;
    queued_count := queued_count + 1;
  end loop;

  return queued_count;
end;
$$;

create or replace function public.run_talent7_competition_heat_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  return public.queue_due_talent7_competition_heat_reminders();
end;
$$;

create or replace function public.check_in_to_talent7_competition_heat(target_heat_entry_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_entry public.talent7_competition_heat_entries;
  target_heat public.talent7_competition_heats;
begin
  if acting_user is null then raise exception 'Log in before checking in'; end if;

  select entry.* into target_entry
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  where entry.id = target_heat_entry_id and registration.user_id = acting_user
  for update of entry;

  if target_entry.id is null then raise exception 'This heat lane is not assigned to your account'; end if;
  select * into target_heat from public.talent7_competition_heats where id = target_entry.heat_id;
  if target_heat.status not in ('Check-in', 'Ready', 'Live') then raise exception 'Check-in is not open for this heat'; end if;
  if now() < target_heat.scheduled_start - interval '60 minutes' then raise exception 'Check-in opens 60 minutes before your heat'; end if;
  if now() > target_heat.scheduled_start + make_interval(secs => target_heat.duration_seconds + 900) then
    raise exception 'The participant check-in window has closed';
  end if;

  update public.talent7_competition_heat_entries
  set check_in_status = 'Checked in', updated_at = now()
  where id = target_heat_entry_id;
  return 'Checked in';
end;
$$;

create or replace function public.submit_my_talent7_competition_heat_proof(
  target_heat_entry_id uuid,
  target_proof_type text,
  target_proof_url text,
  target_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_entry public.talent7_competition_heat_entries;
  target_heat public.talent7_competition_heats;
  existing_proof public.talent7_competition_heat_proofs;
  saved_id uuid;
begin
  if acting_user is null then raise exception 'Log in before submitting footage'; end if;
  target_proof_type := initcap(btrim(coalesce(target_proof_type, '')));
  target_proof_url := btrim(coalesce(target_proof_url, ''));
  target_notes := nullif(btrim(coalesce(target_notes, '')), '');
  if target_proof_type not in ('Video', 'Image', 'Link') then raise exception 'Choose Video, Image, or Link'; end if;
  if target_proof_url !~* '^https?://' or char_length(target_proof_url) > 2000 then raise exception 'Use a valid HTTPS proof link'; end if;
  if target_notes is not null and char_length(target_notes) > 500 then raise exception 'Keep proof notes within 500 characters'; end if;

  select entry.* into target_entry
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  where entry.id = target_heat_entry_id and registration.user_id = acting_user;
  if target_entry.id is null then raise exception 'This heat lane is not assigned to your account'; end if;

  select * into target_heat from public.talent7_competition_heats where id = target_entry.heat_id;
  if target_heat.status not in ('Ready', 'Live', 'Review') then
    raise exception 'Footage can be submitted from the Ready stage through organizer review';
  end if;

  select * into existing_proof
  from public.talent7_competition_heat_proofs
  where heat_entry_id = target_heat_entry_id
  for update;
  if existing_proof.id is not null and existing_proof.review_status in ('Pending', 'Accepted') then
    raise exception 'This lane already has footage awaiting or accepted by the organizer';
  end if;

  insert into public.talent7_competition_heat_proofs (
    heat_entry_id, uploader_user_id, proof_type, proof_url, notes, review_status,
    review_note, reviewed_by, reviewed_at, retention_expires_at, updated_at
  ) values (
    target_heat_entry_id, acting_user, target_proof_type, target_proof_url, target_notes, 'Pending',
    null, null, null, greatest(now() + interval '30 days', target_heat.scheduled_start + interval '30 days'), now()
  )
  on conflict (heat_entry_id) do update set
    uploader_user_id = excluded.uploader_user_id,
    proof_type = excluded.proof_type,
    proof_url = excluded.proof_url,
    notes = excluded.notes,
    review_status = 'Pending',
    review_note = null,
    reviewed_by = null,
    reviewed_at = null,
    retention_expires_at = excluded.retention_expires_at,
    updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.get_my_talent7_competition_heat_controls(target_campaign_id uuid)
returns table (
  entry_id uuid,
  heat_id uuid,
  cohort_number integer,
  round_name text,
  heat_number integer,
  stage_number integer,
  lane_number integer,
  scheduled_start timestamptz,
  duration_seconds integer,
  heat_status text,
  check_in_status text,
  proof_id uuid,
  proof_type text,
  proof_url text,
  proof_notes text,
  proof_review_status text,
  proof_review_note text,
  proof_retention_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    entry.id,
    heat.id,
    heat.cohort_number,
    heat.round_name,
    heat.heat_number,
    heat.stage_number,
    entry.lane_number,
    heat.scheduled_start,
    heat.duration_seconds,
    heat.status,
    entry.check_in_status,
    proof.id,
    proof.proof_type,
    proof.proof_url,
    proof.notes,
    proof.review_status,
    proof.review_note,
    proof.retention_expires_at
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_heats heat on heat.id = entry.heat_id
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  left join public.talent7_competition_heat_proofs proof on proof.heat_entry_id = entry.id
  where heat.campaign_id = target_campaign_id
    and registration.user_id = auth.uid()
    and heat.status <> 'Cancelled'
  order by heat.scheduled_start, heat.heat_number;
$$;

create or replace function public.get_talent7_competition_heat_review_desk(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;

  return jsonb_build_object(
    'proofs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', proof.id,
        'entry_id', entry.id,
        'heat_id', heat.id,
        'cohort_number', heat.cohort_number,
        'heat_number', heat.heat_number,
        'lane_number', entry.lane_number,
        'display_name', registration.display_name,
        'proof_type', proof.proof_type,
        'proof_url', proof.proof_url,
        'notes', proof.notes,
        'review_status', proof.review_status,
        'review_note', proof.review_note,
        'retention_expires_at', proof.retention_expires_at,
        'created_at', proof.created_at
      ) order by proof.created_at desc)
      from public.talent7_competition_heat_proofs proof
      join public.talent7_competition_heat_entries entry on entry.id = proof.heat_entry_id
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      where heat.campaign_id = target_campaign_id
    ), '[]'::jsonb),
    'reminders', jsonb_build_object(
      'pending', (select count(*) from public.talent7_competition_heat_reminders scheduled
        join public.talent7_competition_heat_entries entry on entry.id = scheduled.heat_entry_id
        join public.talent7_competition_heats heat on heat.id = entry.heat_id
        where heat.campaign_id = target_campaign_id and scheduled.sent_at is null),
      'due', (select count(*) from public.talent7_competition_heat_reminders scheduled
        join public.talent7_competition_heat_entries entry on entry.id = scheduled.heat_entry_id
        join public.talent7_competition_heats heat on heat.id = entry.heat_id
        where heat.campaign_id = target_campaign_id and scheduled.sent_at is null and scheduled.due_at <= now()),
      'sent', (select count(*) from public.talent7_competition_heat_reminders scheduled
        join public.talent7_competition_heat_entries entry on entry.id = scheduled.heat_entry_id
        join public.talent7_competition_heats heat on heat.id = entry.heat_id
        where heat.campaign_id = target_campaign_id and scheduled.sent_at is not null)
    )
  );
end;
$$;

create or replace function public.review_talent7_competition_heat_proof(
  target_proof_id uuid,
  target_status text,
  target_review_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_proof public.talent7_competition_heat_proofs;
  target_recipient uuid;
  target_heat_id uuid;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  target_status := initcap(btrim(coalesce(target_status, '')));
  target_review_note := nullif(btrim(coalesce(target_review_note, '')), '');
  if target_status not in ('Accepted', 'Rejected') then raise exception 'Choose Accepted or Rejected'; end if;
  if target_review_note is not null and char_length(target_review_note) > 500 then raise exception 'Keep the review note within 500 characters'; end if;

  select * into target_proof from public.talent7_competition_heat_proofs where id = target_proof_id for update;
  if target_proof.id is null then raise exception 'Proof not found'; end if;

  select registration.user_id, heat.id into target_recipient, target_heat_id
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  join public.talent7_competition_heats heat on heat.id = entry.heat_id
  where entry.id = target_proof.heat_entry_id;

  update public.talent7_competition_heat_proofs
  set review_status = target_status,
      review_note = target_review_note,
      reviewed_by = acting_user,
      reviewed_at = now(),
      updated_at = now()
  where id = target_proof_id;

  perform public.enqueue_push_notification(
    target_recipient,
    acting_user,
    'Proof and result',
    'Competition footage ' || lower(target_status),
    case when target_status = 'Accepted'
      then 'Your heat footage passed organizer review.'
      else 'Your heat footage needs attention. Open your heat card to read the review note.'
    end,
    '#community-competition',
    'competition_heat',
    target_heat_id
  );
  return target_status;
end;
$$;

revoke all on function public.schedule_talent7_competition_heat_reminders() from public;
revoke all on function public.queue_due_talent7_competition_heat_reminders() from public;
revoke all on function public.run_talent7_competition_heat_reminders() from public;
revoke all on function public.check_in_to_talent7_competition_heat(uuid) from public;
revoke all on function public.submit_my_talent7_competition_heat_proof(uuid, text, text, text) from public;
revoke all on function public.get_my_talent7_competition_heat_controls(uuid) from public;
revoke all on function public.get_talent7_competition_heat_review_desk(uuid) from public;
revoke all on function public.review_talent7_competition_heat_proof(uuid, text, text) from public;

grant execute on function public.run_talent7_competition_heat_reminders() to authenticated;
grant execute on function public.check_in_to_talent7_competition_heat(uuid) to authenticated;
grant execute on function public.submit_my_talent7_competition_heat_proof(uuid, text, text, text) to authenticated;
grant execute on function public.get_my_talent7_competition_heat_controls(uuid) to authenticated;
grant execute on function public.get_talent7_competition_heat_review_desk(uuid) to authenticated;
grant execute on function public.review_talent7_competition_heat_proof(uuid, text, text) to authenticated;

-- Supabase projects with pg_cron available are wired automatically. If the
-- extension cannot be enabled on this plan, the organizer desk can safely run
-- the same idempotent queue function on demand.
do $setup_reminder_cron$
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  exception when others then
    raise notice 'pg_cron is unavailable; use the organizer reminder button or enable Cron in Supabase';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule(
        'talent7-competition-heat-reminders',
        '*/5 * * * *',
        'select public.queue_due_talent7_competition_heat_reminders();'
      )
    $cron$;
  end if;
end;
$setup_reminder_cron$;

comment on table public.talent7_competition_heat_proofs is
  'Organizer-indexed heat footage. URLs are never returned by public heat-board functions; accepted files are retained for the published review window.';
comment on table public.talent7_competition_heat_reminders is
  'Idempotent assignment, pre-start, and check-in reminders queued into the existing Firebase notification outbox.';

commit;
