-- Talent7 heat operations for scalable live community competitions.
-- Run after add-community-competition-organizer-controls.sql.

begin;

create table if not exists public.talent7_competition_heats (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  cohort_number integer not null check (cohort_number > 0),
  round_name text not null default 'Qualifier'
    check (round_name in ('Qualifier', 'Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final')),
  heat_number integer not null check (heat_number > 0),
  stage_number integer not null default 1 check (stage_number between 1 and 8),
  max_lanes integer not null default 4 check (max_lanes between 2 and 4),
  duration_seconds integer not null default 60 check (duration_seconds between 10 and 3600),
  scheduled_start timestamptz not null,
  status text not null default 'Draft'
    check (status in ('Draft', 'Check-in', 'Ready', 'Live', 'Review', 'Final', 'Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, cohort_number, round_name, heat_number)
);

create index if not exists talent7_competition_heats_campaign_schedule_idx
on public.talent7_competition_heats (campaign_id, scheduled_start, stage_number);

create table if not exists public.talent7_competition_heat_entries (
  id uuid primary key default uuid_generate_v4(),
  heat_id uuid not null references public.talent7_competition_heats(id) on delete cascade,
  registration_id uuid not null references public.talent7_competition_registrations(id) on delete cascade,
  lane_number integer not null check (lane_number between 1 and 4),
  check_in_status text not null default 'Pending'
    check (check_in_status in ('Pending', 'Checked in', 'No show')),
  raw_score numeric check (raw_score is null or (raw_score >= 0 and raw_score <= 1000000)),
  penalty_score numeric not null default 0 check (penalty_score >= 0 and penalty_score <= 1000000),
  final_score numeric check (final_score is null or (final_score >= 0 and final_score <= 1000000)),
  result_status text not null default 'Pending'
    check (result_status in ('Pending', 'Provisional', 'Verified', 'Rejected')),
  placement integer check (placement is null or placement > 0),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, registration_id),
  unique (heat_id, lane_number),
  check (review_note is null or char_length(review_note) <= 500)
);

create index if not exists talent7_competition_heat_entries_registration_idx
on public.talent7_competition_heat_entries (registration_id, created_at desc);

alter table public.talent7_competition_heats enable row level security;
alter table public.talent7_competition_heat_entries enable row level security;
revoke all on public.talent7_competition_heats from anon, authenticated;
revoke all on public.talent7_competition_heat_entries from anon, authenticated;

create or replace function public.generate_talent7_competition_heats(
  target_campaign_id uuid,
  target_cohort_number integer,
  target_round_name text,
  target_max_lanes integer,
  target_parallel_stages integer,
  target_first_start timestamptz,
  target_interval_minutes integer,
  target_duration_seconds integer default 60
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  campaign public.talent7_competition_campaigns;
  entrant record;
  entrant_index integer := 0;
  generated_heats integer := 0;
  total_entrants integer;
  target_heat_count integer;
  base_heat_size integer;
  extra_heat_count integer;
  adjusted_index integer;
  target_heat_number integer;
  target_stage_number integer;
  target_lane_number integer;
  target_heat public.talent7_competition_heats;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;

  select * into campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id
  for update;
  if campaign.id is null then raise exception 'Competition campaign not found'; end if;
  if campaign.phase not in ('Registration', 'Scheduled') then
    raise exception 'Generate heats during registration or after scheduling';
  end if;
  if target_cohort_number is null or target_cohort_number < 1 then raise exception 'Choose a valid cohort'; end if;
  if target_round_name not in ('Qualifier', 'Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final') then
    raise exception 'Choose a valid competition round';
  end if;
  if target_max_lanes not between 2 and 4 then raise exception 'Each heat must use between 2 and 4 competitor lanes'; end if;
  if target_parallel_stages not between 1 and 8 then raise exception 'Choose between 1 and 8 parallel stages'; end if;
  if target_first_start is null or target_first_start <= now() then raise exception 'Choose a future first heat time'; end if;
  if target_interval_minutes not between 1 and 120 then raise exception 'Heat interval must be between 1 and 120 minutes'; end if;
  if target_duration_seconds not between 10 and 3600 then raise exception 'Heat duration must be between 10 and 3600 seconds'; end if;
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id
      and heat.cohort_number = target_cohort_number
      and heat.round_name = target_round_name
  ) then raise exception 'This cohort and round already has heats'; end if;

  select count(*)::integer into total_entrants
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id
    and registration.cohort_number = target_cohort_number
    and registration.status = 'Confirmed';
  if total_entrants < 2 then raise exception 'Confirm at least two entrants in this cohort before generating heats'; end if;

  target_heat_count := ceil(total_entrants::numeric / target_max_lanes)::integer;
  base_heat_size := floor(total_entrants::numeric / target_heat_count)::integer;
  extra_heat_count := total_entrants % target_heat_count;

  for entrant in
    select registration.id
    from public.talent7_competition_registrations registration
    where registration.campaign_id = target_campaign_id
      and registration.cohort_number = target_cohort_number
      and registration.status = 'Confirmed'
    order by registration.slot_number, registration.created_at
  loop
    if entrant_index < (base_heat_size + 1) * extra_heat_count then
      target_heat_number := floor(entrant_index::numeric / (base_heat_size + 1))::integer + 1;
      target_lane_number := (entrant_index % (base_heat_size + 1)) + 1;
    else
      adjusted_index := entrant_index - ((base_heat_size + 1) * extra_heat_count);
      target_heat_number := extra_heat_count + floor(adjusted_index::numeric / base_heat_size)::integer + 1;
      target_lane_number := (adjusted_index % base_heat_size) + 1;
    end if;
    target_stage_number := ((target_heat_number - 1) % target_parallel_stages) + 1;

    select * into target_heat
    from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id
      and heat.cohort_number = target_cohort_number
      and heat.round_name = target_round_name
      and heat.heat_number = target_heat_number;

    if target_heat.id is null then
      insert into public.talent7_competition_heats (
        campaign_id, cohort_number, round_name, heat_number, stage_number,
        max_lanes, duration_seconds, scheduled_start
      ) values (
        target_campaign_id,
        target_cohort_number,
        target_round_name,
        target_heat_number,
        target_stage_number,
        target_max_lanes,
        target_duration_seconds,
        target_first_start + (
          floor((target_heat_number - 1)::numeric / target_parallel_stages)::integer
          * target_interval_minutes * interval '1 minute'
        )
      ) returning * into target_heat;
      generated_heats := generated_heats + 1;
    end if;

    insert into public.talent7_competition_heat_entries (
      heat_id, registration_id, lane_number
    ) values (
      target_heat.id, entrant.id, target_lane_number
    );
    entrant_index := entrant_index + 1;
    target_heat := null;
  end loop;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    target_campaign_id,
    acting_user,
    'Competition heats generated',
    jsonb_build_object(
      'cohort', target_cohort_number,
      'round', target_round_name,
      'entrants', entrant_index,
      'heats', generated_heats,
      'lanes', target_max_lanes,
      'parallel_stages', target_parallel_stages
    )
  );
  return generated_heats;
end;
$$;

create or replace function public.get_talent7_competition_heat_board(target_campaign_id uuid)
returns table (
  heat_id uuid,
  cohort_number integer,
  round_name text,
  heat_number integer,
  stage_number integer,
  max_lanes integer,
  duration_seconds integer,
  scheduled_start timestamptz,
  heat_status text,
  entry_id uuid,
  lane_number integer,
  public_display_name text,
  check_in_status text,
  final_score numeric,
  result_status text,
  placement integer,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    heat.id,
    heat.cohort_number,
    heat.round_name,
    heat.heat_number,
    heat.stage_number,
    heat.max_lanes,
    heat.duration_seconds,
    heat.scheduled_start,
    heat.status,
    entry.id,
    entry.lane_number,
    case
      when registration.user_id = auth.uid() then registration.display_name
      when registration.public_anonymous then 'Anonymous competitor'
      else registration.display_name
    end,
    case
      when registration.user_id = auth.uid() or heat.status in ('Live', 'Review', 'Final') then entry.check_in_status
      else 'Pending'
    end,
    case when heat.status in ('Review', 'Final') then entry.final_score else null end,
    entry.result_status,
    case when heat.status = 'Final' then entry.placement else null end,
    registration.user_id = auth.uid()
  from public.talent7_competition_heats heat
  join public.talent7_competition_heat_entries entry on entry.heat_id = heat.id
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  join public.talent7_competition_campaigns campaign on campaign.id = heat.campaign_id
  where heat.campaign_id = target_campaign_id
    and heat.status <> 'Cancelled'
    and campaign.phase in ('Scheduled', 'Live', 'Review', 'Completed')
  order by heat.scheduled_start, heat.stage_number, heat.heat_number, entry.lane_number;
$$;

create or replace function public.get_talent7_competition_heat_desk(target_campaign_id uuid)
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
    'heats', coalesce((
      select jsonb_agg(to_jsonb(heat) order by heat.scheduled_start, heat.stage_number, heat.heat_number)
      from public.talent7_competition_heats heat
      where heat.campaign_id = target_campaign_id and heat.status <> 'Cancelled'
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'heat_id', entry.heat_id,
          'registration_id', entry.registration_id,
          'display_name', registration.display_name,
          'public_anonymous', registration.public_anonymous,
          'registration_code', registration.registration_code,
          'lane_number', entry.lane_number,
          'check_in_status', entry.check_in_status,
          'raw_score', entry.raw_score,
          'penalty_score', entry.penalty_score,
          'final_score', entry.final_score,
          'result_status', entry.result_status,
          'placement', entry.placement,
          'review_note', entry.review_note
        ) order by heat.scheduled_start, heat.stage_number, heat.heat_number, entry.lane_number
      )
      from public.talent7_competition_heat_entries entry
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      where heat.campaign_id = target_campaign_id and heat.status <> 'Cancelled'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_talent7_competition_heat_status(
  target_heat_id uuid,
  target_status text
)
returns public.talent7_competition_heats
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  heat public.talent7_competition_heats;
  saved_heat public.talent7_competition_heats;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  select * into heat from public.talent7_competition_heats where id = target_heat_id for update;
  if heat.id is null then raise exception 'Competition heat not found'; end if;
  if not (
    (heat.status = 'Draft' and target_status = 'Check-in')
    or (heat.status = 'Check-in' and target_status = 'Ready')
    or (heat.status = 'Ready' and target_status = 'Live')
    or (heat.status = 'Live' and target_status = 'Review')
    or target_status = 'Cancelled'
  ) then raise exception 'Invalid heat status change'; end if;
  if target_status = 'Ready' and not exists (
    select 1 from public.talent7_competition_heat_entries entry
    where entry.heat_id = heat.id and entry.check_in_status = 'Checked in'
  ) then raise exception 'Check in at least one competitor before marking the heat ready'; end if;

  update public.talent7_competition_heats
  set status = target_status, updated_at = now()
  where id = heat.id
  returning * into saved_heat;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    heat.campaign_id,
    acting_user,
    'Heat status updated',
    jsonb_build_object('heat_id', heat.id, 'from', heat.status, 'to', target_status)
  );
  return saved_heat;
end;
$$;

create or replace function public.update_talent7_competition_heat_entry(
  target_entry_id uuid,
  target_check_in_status text default null,
  target_raw_score numeric default null,
  target_penalty_score numeric default 0,
  target_review_note text default null
)
returns public.talent7_competition_heat_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  entry public.talent7_competition_heat_entries;
  heat public.talent7_competition_heats;
  saved_entry public.talent7_competition_heat_entries;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  select * into entry from public.talent7_competition_heat_entries where id = target_entry_id for update;
  if entry.id is null then raise exception 'Heat entry not found'; end if;
  select * into heat from public.talent7_competition_heats where id = entry.heat_id;
  if heat.status in ('Final', 'Cancelled') then raise exception 'This heat can no longer be edited'; end if;
  if target_check_in_status is not null and target_check_in_status not in ('Pending', 'Checked in', 'No show') then
    raise exception 'Choose a valid check-in status';
  end if;
  if target_raw_score is not null and (target_raw_score < 0 or target_raw_score > 1000000) then raise exception 'Enter a valid raw score'; end if;
  if target_penalty_score is null or target_penalty_score < 0 or target_penalty_score > 1000000 then raise exception 'Enter a valid penalty'; end if;
  if char_length(coalesce(target_review_note, '')) > 500 then raise exception 'Keep the review note under 500 characters'; end if;

  update public.talent7_competition_heat_entries
  set check_in_status = coalesce(target_check_in_status, check_in_status),
      raw_score = target_raw_score,
      penalty_score = target_penalty_score,
      final_score = case when target_raw_score is null then null else greatest(target_raw_score - target_penalty_score, 0) end,
      result_status = case when target_raw_score is null then 'Pending' else 'Provisional' end,
      placement = null,
      review_note = nullif(btrim(target_review_note), ''),
      reviewed_by = acting_user,
      reviewed_at = now(),
      updated_at = now()
  where id = entry.id
  returning * into saved_entry;
  return saved_entry;
end;
$$;

create or replace function public.finalize_talent7_competition_heat(target_heat_id uuid)
returns public.talent7_competition_heats
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  heat public.talent7_competition_heats;
  saved_heat public.talent7_competition_heats;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  select * into heat from public.talent7_competition_heats where id = target_heat_id for update;
  if heat.id is null or heat.status <> 'Review' then raise exception 'Move the heat to review before finalizing'; end if;
  if exists (
    select 1 from public.talent7_competition_heat_entries entry
    where entry.heat_id = heat.id
      and entry.check_in_status = 'Checked in'
      and entry.final_score is null
  ) then raise exception 'Every checked-in competitor needs a reviewed score'; end if;
  if not exists (
    select 1 from public.talent7_competition_heat_entries entry
    where entry.heat_id = heat.id and entry.final_score is not null
  ) then raise exception 'Enter at least one reviewed score'; end if;

  with ranked as (
    select
      entry.id,
      dense_rank() over (order by entry.final_score desc, entry.updated_at asc)::integer as next_placement
    from public.talent7_competition_heat_entries entry
    where entry.heat_id = heat.id and entry.final_score is not null
  )
  update public.talent7_competition_heat_entries entry
  set placement = ranked.next_placement,
      result_status = 'Verified',
      reviewed_by = acting_user,
      reviewed_at = now(),
      updated_at = now()
  from ranked
  where entry.id = ranked.id;

  update public.talent7_competition_heat_entries
  set result_status = 'Rejected', reviewed_by = acting_user, reviewed_at = now(), updated_at = now()
  where heat_id = heat.id and final_score is null;

  update public.talent7_competition_heats
  set status = 'Final', updated_at = now()
  where id = heat.id
  returning * into saved_heat;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    heat.campaign_id,
    acting_user,
    'Heat finalized',
    jsonb_build_object('heat_id', heat.id, 'cohort', heat.cohort_number, 'round', heat.round_name, 'heat', heat.heat_number)
  );
  return saved_heat;
end;
$$;

revoke all on function public.generate_talent7_competition_heats(uuid, integer, text, integer, integer, timestamptz, integer, integer) from public;
revoke all on function public.get_talent7_competition_heat_board(uuid) from public;
revoke all on function public.get_talent7_competition_heat_desk(uuid) from public;
revoke all on function public.update_talent7_competition_heat_status(uuid, text) from public;
revoke all on function public.update_talent7_competition_heat_entry(uuid, text, numeric, numeric, text) from public;
revoke all on function public.finalize_talent7_competition_heat(uuid) from public;

grant execute on function public.generate_talent7_competition_heats(uuid, integer, text, integer, integer, timestamptz, integer, integer) to authenticated;
grant execute on function public.get_talent7_competition_heat_board(uuid) to anon, authenticated;
grant execute on function public.get_talent7_competition_heat_desk(uuid) to authenticated;
grant execute on function public.update_talent7_competition_heat_status(uuid, text) to authenticated;
grant execute on function public.update_talent7_competition_heat_entry(uuid, text, numeric, numeric, text) to authenticated;
grant execute on function public.finalize_talent7_competition_heat(uuid) to authenticated;

comment on table public.talent7_competition_heats is
  'Timed 2-to-4 competitor heats. Organizers and presenters are never counted as competitor lanes.';
comment on table public.talent7_competition_heat_entries is
  'Private lane assignments, check-in state, provisional scoring, penalties, and verified placements.';

commit;
