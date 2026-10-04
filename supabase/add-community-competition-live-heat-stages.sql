-- Talent7 native LiveKit stages for 2-to-4-person competition heats.
-- Run after add-community-competition-heat-proof-reminders.sql.

begin;

alter table public.talent7_competition_heats
  add column if not exists clock_starts_at timestamptz,
  add column if not exists clock_ends_at timestamptz,
  add column if not exists live_ended_at timestamptz;

alter table public.talent7_competition_heats
  drop constraint if exists talent7_competition_heats_clock_window_check;
alter table public.talent7_competition_heats
  add constraint talent7_competition_heats_clock_window_check check (
    clock_starts_at is null
    or clock_ends_at is null
    or clock_ends_at >= clock_starts_at
  );

create or replace function public.sync_talent7_competition_heat_clock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Live' and old.status <> 'Live' then
    new.clock_starts_at := coalesce(new.clock_starts_at, now() + interval '5 seconds');
    new.clock_ends_at := coalesce(
      new.clock_ends_at,
      new.clock_starts_at + make_interval(secs => new.duration_seconds)
    );
    new.live_ended_at := null;
  elsif new.status in ('Review', 'Final', 'Cancelled') and old.status = 'Live' then
    new.live_ended_at := coalesce(new.live_ended_at, now());
    if new.clock_ends_at is null or new.clock_ends_at > now() then
      new.clock_ends_at := now();
    end if;
  elsif new.status in ('Draft', 'Check-in', 'Ready') and old.status in ('Review', 'Final', 'Cancelled') then
    new.clock_starts_at := null;
    new.clock_ends_at := null;
    new.live_ended_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_talent7_competition_heat_clock_trigger
on public.talent7_competition_heats;
create trigger sync_talent7_competition_heat_clock_trigger
before update of status on public.talent7_competition_heats
for each row execute function public.sync_talent7_competition_heat_clock();

create or replace function public.start_talent7_competition_live_heat(
  target_heat_id uuid,
  target_countdown_seconds integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_heat public.talent7_competition_heats;
  checked_in_count integer;
  clock_start timestamptz;
  recipient record;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_countdown_seconds not between 3 and 30 then raise exception 'Countdown must be between 3 and 30 seconds'; end if;

  select * into target_heat
  from public.talent7_competition_heats
  where id = target_heat_id
  for update;
  if target_heat.id is null then raise exception 'Heat not found'; end if;
  if target_heat.status <> 'Ready' then raise exception 'Move the heat to Ready before starting the live clock'; end if;

  select count(*) into checked_in_count
  from public.talent7_competition_heat_entries entry
  where entry.heat_id = target_heat_id and entry.check_in_status = 'Checked in';
  if checked_in_count < 2 then raise exception 'At least two competitors must be checked in before the heat starts'; end if;

  clock_start := now() + make_interval(secs => target_countdown_seconds);
  update public.talent7_competition_heats
  set status = 'Live',
      clock_starts_at = clock_start,
      clock_ends_at = clock_start + make_interval(secs => duration_seconds),
      live_ended_at = null,
      updated_at = now()
  where id = target_heat_id
  returning * into target_heat;

  for recipient in
    select registration.user_id
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where entry.heat_id = target_heat_id and entry.check_in_status = 'Checked in'
  loop
    perform public.enqueue_push_notification(
      recipient.user_id,
      acting_user,
      'Live room',
      'Your competition heat is live',
      'Heat ' || target_heat.heat_number || ' is starting now. Open your Talent7 live stage.',
      '#community-competition',
      'competition_heat',
      target_heat.id
    );
  end loop;

  return jsonb_build_object(
    'heat_id', target_heat.id,
    'status', target_heat.status,
    'clock_starts_at', target_heat.clock_starts_at,
    'clock_ends_at', target_heat.clock_ends_at
  );
end;
$$;

create or replace function public.end_talent7_competition_live_heat(target_heat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_heat public.talent7_competition_heats;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;

  select * into target_heat
  from public.talent7_competition_heats
  where id = target_heat_id
  for update;
  if target_heat.id is null then raise exception 'Heat not found'; end if;
  if target_heat.status <> 'Live' then raise exception 'Only a live heat can be ended'; end if;

  update public.talent7_competition_heats
  set status = 'Review', live_ended_at = now(), clock_ends_at = least(coalesce(clock_ends_at, now()), now()), updated_at = now()
  where id = target_heat_id
  returning * into target_heat;

  return jsonb_build_object(
    'heat_id', target_heat.id,
    'status', target_heat.status,
    'live_ended_at', target_heat.live_ended_at
  );
end;
$$;

create or replace function public.get_talent7_competition_live_heat_state(target_heat_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_heat public.talent7_competition_heats;
  viewer_role text := 'Audience';
begin
  select * into target_heat
  from public.talent7_competition_heats heat
  where heat.id = target_heat_id and heat.status <> 'Cancelled';
  if target_heat.id is null then return null; end if;

  if exists (select 1 from public.app_admins where app_admins.user_id = auth.uid()) then
    viewer_role := 'Organizer';
  elsif exists (
    select 1
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where entry.heat_id = target_heat_id and registration.user_id = auth.uid()
  ) then
    viewer_role := 'Competitor';
  end if;

  return jsonb_build_object(
    'heat_id', target_heat.id,
    'campaign_id', target_heat.campaign_id,
    'cohort_number', target_heat.cohort_number,
    'round_name', target_heat.round_name,
    'heat_number', target_heat.heat_number,
    'stage_number', target_heat.stage_number,
    'max_lanes', target_heat.max_lanes,
    'duration_seconds', target_heat.duration_seconds,
    'scheduled_start', target_heat.scheduled_start,
    'status', target_heat.status,
    'clock_starts_at', target_heat.clock_starts_at,
    'clock_ends_at', target_heat.clock_ends_at,
    'live_ended_at', target_heat.live_ended_at,
    'viewer_role', viewer_role,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lane_number', entry.lane_number,
        'display_name', case
          when registration.user_id = auth.uid() then registration.display_name
          when registration.public_anonymous then 'Anonymous competitor'
          else registration.display_name
        end,
        'check_in_status', case
          when registration.user_id = auth.uid() or target_heat.status in ('Live', 'Review', 'Final') then entry.check_in_status
          else 'Pending'
        end,
        'is_mine', registration.user_id = auth.uid()
      ) order by entry.lane_number)
      from public.talent7_competition_heat_entries entry
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      where entry.heat_id = target_heat_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.sync_talent7_competition_heat_clock() from public;
revoke all on function public.start_talent7_competition_live_heat(uuid, integer) from public;
revoke all on function public.end_talent7_competition_live_heat(uuid) from public;
revoke all on function public.get_talent7_competition_live_heat_state(uuid) from public;

grant execute on function public.start_talent7_competition_live_heat(uuid, integer) to authenticated;
grant execute on function public.end_talent7_competition_live_heat(uuid) to authenticated;
grant execute on function public.get_talent7_competition_live_heat_state(uuid) to anon, authenticated;

comment on function public.start_talent7_competition_live_heat(uuid, integer) is
  'Starts one synchronized countdown and competition clock after at least two assigned lanes check in.';
comment on function public.get_talent7_competition_live_heat_state(uuid) is
  'Returns a privacy-safe live heat clock and lane board. LiveKit credentials are issued separately by the server.';

commit;
