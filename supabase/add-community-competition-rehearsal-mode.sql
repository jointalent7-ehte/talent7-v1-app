-- Talent7 isolated organizer rehearsals and launch-readiness gates.
-- Run after add-community-competition-prize-fulfillment.sql.

begin;

create table if not exists public.talent7_competition_rehearsals (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  label text not null check (char_length(label) between 3 and 100),
  lane_count integer not null default 4 check (lane_count between 2 and 4),
  countdown_seconds integer not null default 5 check (countdown_seconds between 3 and 30),
  duration_seconds integer not null default 60 check (duration_seconds between 10 and 600),
  status text not null default 'Draft' check (status in ('Draft', 'Running', 'Passed', 'Failed', 'Cancelled')),
  clock_starts_at timestamptz,
  clock_ends_at timestamptz,
  completed_note text check (completed_note is null or char_length(completed_note) <= 500),
  created_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_starts_at is null or clock_ends_at is null or clock_ends_at >= clock_starts_at)
);

create table if not exists public.talent7_competition_rehearsal_checks (
  id uuid primary key default uuid_generate_v4(),
  rehearsal_id uuid not null references public.talent7_competition_rehearsals(id) on delete cascade,
  check_key text not null,
  label text not null check (char_length(label) between 3 and 100),
  guidance text not null check (char_length(guidance) between 10 and 300),
  required boolean not null default true,
  status text not null default 'Pending' check (status in ('Pending', 'Passed', 'Failed', 'Not applicable')),
  note text check (note is null or char_length(note) <= 500),
  checked_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rehearsal_id, check_key)
);

create index if not exists talent7_competition_rehearsals_campaign_idx
on public.talent7_competition_rehearsals (campaign_id, created_at desc);

alter table public.talent7_competition_rehearsals enable row level security;
alter table public.talent7_competition_rehearsal_checks enable row level security;
revoke all on public.talent7_competition_rehearsals, public.talent7_competition_rehearsal_checks from anon, authenticated;

create or replace function public.create_talent7_competition_rehearsal(
  target_campaign_id uuid,
  target_label text,
  target_lane_count integer default 4,
  target_countdown_seconds integer default 5,
  target_duration_seconds integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_id uuid;
  has_prizes boolean;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if not exists (select 1 from public.talent7_competition_campaigns where id = target_campaign_id) then raise exception 'Competition campaign not found'; end if;
  if char_length(btrim(coalesce(target_label, ''))) not between 3 and 100 then raise exception 'Use a rehearsal name between 3 and 100 characters'; end if;
  if target_lane_count not between 2 and 4 then raise exception 'Choose two to four rehearsal lanes'; end if;
  if target_countdown_seconds not between 3 and 30 then raise exception 'Countdown must be between 3 and 30 seconds'; end if;
  if target_duration_seconds not between 10 and 600 then raise exception 'Rehearsal clock must be between 10 and 600 seconds'; end if;

  insert into public.talent7_competition_rehearsals (
    campaign_id, label, lane_count, countdown_seconds, duration_seconds, created_by
  ) values (
    target_campaign_id, btrim(target_label), target_lane_count, target_countdown_seconds,
    target_duration_seconds, acting_user
  ) returning id into saved_id;

  select exists (
    select 1 from public.talent7_competition_prize_offers offer
    where offer.campaign_id = target_campaign_id and offer.status = 'Published'
  ) into has_prizes;

  insert into public.talent7_competition_rehearsal_checks (
    rehearsal_id, check_key, label, guidance, required
  ) values
    (saved_id, 'camera', 'Competitor cameras', 'Confirm each test device can grant camera access and frame the full activity safely.', true),
    (saved_id, 'microphone', 'Host and competitor audio', 'Confirm the host microphone is clear and competitor audio can be muted when required.', true),
    (saved_id, 'clock', 'Countdown and event clock', 'Run the server-timed rehearsal and confirm every observer sees the same start and finish.', true),
    (saved_id, 'judge', 'Judge workflow', 'Confirm the organizer can score, penalize, review, and explain a provisional result.', true),
    (saved_id, 'proof', 'Proof upload and review', 'Upload a harmless test clip, open it in the private desk, then remove it after the drill.', true),
    (saved_id, 'backup', 'Failure fallback', 'Agree how to pause, reschedule, or accept backup footage after a network or camera failure.', true),
    (saved_id, 'notifications', 'Participant reminders', 'Confirm assignment and check-in reminders reach designated test accounts without duplicates.', true),
    (saved_id, 'result_lock', 'Result and tie safety', 'Confirm ties stop advancement and finalized results cannot be silently overwritten.', true),
    (saved_id, 'privacy', 'Privacy review', 'Confirm aliases, proof links, delivery details, and organizer controls are visible only to intended roles.', true),
    (saved_id, 'prize', 'Prize fulfilment', 'Confirm eligibility, shipping limits, digital alternatives, and private claim handling.', has_prizes);

  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_campaign_id, acting_user, 'Competition rehearsal created', jsonb_build_object('rehearsal_id', saved_id));
  return saved_id;
end;
$$;

create or replace function public.get_talent7_competition_rehearsal_state(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = auth.uid()
  ) then raise exception 'Talent7 organizer access required'; end if;
  return jsonb_build_object(
    'rehearsals', coalesce((
      select jsonb_agg(to_jsonb(rehearsal) order by rehearsal.created_at desc)
      from public.talent7_competition_rehearsals rehearsal
      where rehearsal.campaign_id = target_campaign_id
    ), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(to_jsonb(check_item) order by check_item.created_at, check_item.label)
      from public.talent7_competition_rehearsal_checks check_item
      join public.talent7_competition_rehearsals rehearsal on rehearsal.id = check_item.rehearsal_id
      where rehearsal.campaign_id = target_campaign_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.start_talent7_competition_rehearsal(target_rehearsal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rehearsal public.talent7_competition_rehearsals;
  next_start timestamptz;
begin
  if acting_user is null or not exists (select 1 from public.app_admins where app_admins.user_id = acting_user) then raise exception 'Talent7 organizer access required'; end if;
  select * into target_rehearsal from public.talent7_competition_rehearsals where id = target_rehearsal_id for update;
  if target_rehearsal.id is null then raise exception 'Rehearsal not found'; end if;
  if target_rehearsal.status not in ('Draft', 'Running') then raise exception 'Completed rehearsals cannot be restarted'; end if;
  next_start := now() + make_interval(secs => target_rehearsal.countdown_seconds);
  update public.talent7_competition_rehearsals
  set status = 'Running', clock_starts_at = next_start,
      clock_ends_at = next_start + make_interval(secs => duration_seconds),
      started_at = now(), completed_at = null, updated_at = now()
  where id = target_rehearsal.id;
  return jsonb_build_object('clock_starts_at', next_start, 'clock_ends_at', next_start + make_interval(secs => target_rehearsal.duration_seconds));
end;
$$;

create or replace function public.update_talent7_competition_rehearsal_check(
  target_check_id uuid,
  target_status text,
  target_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null or not exists (select 1 from public.app_admins where app_admins.user_id = acting_user) then raise exception 'Talent7 organizer access required'; end if;
  if target_status not in ('Pending', 'Passed', 'Failed', 'Not applicable') then raise exception 'Choose a valid rehearsal result'; end if;
  if char_length(coalesce(target_note, '')) > 500 then raise exception 'Keep the check note under 500 characters'; end if;
  update public.talent7_competition_rehearsal_checks check_item
  set status = target_status, note = nullif(btrim(target_note), ''),
      checked_by = case when target_status = 'Pending' then null else acting_user end,
      checked_at = case when target_status = 'Pending' then null else now() end,
      updated_at = now()
  where check_item.id = target_check_id
    and exists (
      select 1 from public.talent7_competition_rehearsals rehearsal
      where rehearsal.id = check_item.rehearsal_id and rehearsal.status in ('Draft', 'Running')
    );
  if not found then raise exception 'Active rehearsal check not found'; end if;
end;
$$;

create or replace function public.complete_talent7_competition_rehearsal(
  target_rehearsal_id uuid,
  target_result text,
  target_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rehearsal public.talent7_competition_rehearsals;
begin
  if acting_user is null or not exists (select 1 from public.app_admins where app_admins.user_id = acting_user) then raise exception 'Talent7 organizer access required'; end if;
  if target_result not in ('Passed', 'Failed') then raise exception 'Choose Passed or Failed'; end if;
  if char_length(coalesce(target_note, '')) > 500 then raise exception 'Keep the rehearsal note under 500 characters'; end if;
  select * into target_rehearsal from public.talent7_competition_rehearsals where id = target_rehearsal_id for update;
  if target_rehearsal.id is null or target_rehearsal.status not in ('Draft', 'Running') then raise exception 'Active rehearsal not found'; end if;
  if target_result = 'Passed' and exists (
    select 1 from public.talent7_competition_rehearsal_checks check_item
    where check_item.rehearsal_id = target_rehearsal.id
      and check_item.required
      and check_item.status <> 'Passed'
  ) then raise exception 'Every required readiness check must pass before the rehearsal can pass'; end if;
  update public.talent7_competition_rehearsals
  set status = target_result, completed_note = nullif(btrim(target_note), ''),
      completed_at = now(), updated_at = now()
  where id = target_rehearsal.id;
  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_rehearsal.campaign_id, acting_user, 'Competition rehearsal completed', jsonb_build_object(
    'rehearsal_id', target_rehearsal.id, 'result', target_result
  ));
end;
$$;

revoke all on function public.create_talent7_competition_rehearsal(uuid, text, integer, integer, integer) from public;
revoke all on function public.get_talent7_competition_rehearsal_state(uuid) from public;
revoke all on function public.start_talent7_competition_rehearsal(uuid) from public;
revoke all on function public.update_talent7_competition_rehearsal_check(uuid, text, text) from public;
revoke all on function public.complete_talent7_competition_rehearsal(uuid, text, text) from public;

grant execute on function public.create_talent7_competition_rehearsal(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.get_talent7_competition_rehearsal_state(uuid) to authenticated;
grant execute on function public.start_talent7_competition_rehearsal(uuid) to authenticated;
grant execute on function public.update_talent7_competition_rehearsal_check(uuid, text, text) to authenticated;
grant execute on function public.complete_talent7_competition_rehearsal(uuid, text, text) to authenticated;

comment on table public.talent7_competition_rehearsals is
  'Organizer-only dry runs isolated from real participants, rankings, prizes, and notification delivery.';

commit;
