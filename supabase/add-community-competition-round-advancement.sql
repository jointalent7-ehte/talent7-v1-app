-- Talent7 verified round advancement and public tournament progress.
-- Run after add-community-competition-live-heat-stages.sql.

begin;

alter table public.talent7_competition_heat_entries
  add column if not exists advancement_status text not null default 'Awaiting review',
  add column if not exists advancement_note text,
  add column if not exists advancement_manual boolean not null default false,
  add column if not exists advancement_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists advancement_decided_at timestamptz,
  add column if not exists advanced_from_entry_id uuid references public.talent7_competition_heat_entries(id) on delete set null;

alter table public.talent7_competition_heat_entries
  drop constraint if exists talent7_competition_heat_entries_advancement_status_check;
alter table public.talent7_competition_heat_entries
  add constraint talent7_competition_heat_entries_advancement_status_check check (
    advancement_status in ('Awaiting review', 'Qualified', 'Eliminated', 'Tiebreak', 'Disqualified')
  );
alter table public.talent7_competition_heat_entries
  drop constraint if exists talent7_competition_heat_entries_advancement_note_check;
alter table public.talent7_competition_heat_entries
  add constraint talent7_competition_heat_entries_advancement_note_check check (
    advancement_note is null or char_length(advancement_note) <= 500
  );

create unique index if not exists talent7_competition_heat_entries_advanced_source_idx
on public.talent7_competition_heat_entries (advanced_from_entry_id)
where advanced_from_entry_id is not null;

create table if not exists public.talent7_competition_round_advancements (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  cohort_number integer not null check (cohort_number > 0),
  source_round_name text not null check (source_round_name in ('Qualifier', 'Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal')),
  next_round_name text not null check (next_round_name in ('Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final')),
  qualifiers_per_heat integer not null check (qualifiers_per_heat between 1 and 3),
  qualified_count integer not null default 0 check (qualified_count >= 0),
  next_heat_count integer not null default 0 check (next_heat_count >= 0),
  status text not null default 'Draft' check (status in ('Draft', 'Blocked', 'Generated')),
  blocker_summary text,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, cohort_number, source_round_name)
);

create table if not exists public.talent7_competition_champions (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  cohort_number integer not null check (cohort_number > 0),
  registration_id uuid not null references public.talent7_competition_registrations(id) on delete cascade,
  final_entry_id uuid not null unique references public.talent7_competition_heat_entries(id) on delete cascade,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (campaign_id, cohort_number)
);

alter table public.talent7_competition_round_advancements enable row level security;
alter table public.talent7_competition_champions enable row level security;
revoke all on public.talent7_competition_round_advancements from anon, authenticated;
revoke all on public.talent7_competition_champions from anon, authenticated;

create or replace function public.get_talent7_competition_progress_board(target_campaign_id uuid)
returns table (
  cohort_number integer,
  round_name text,
  heat_id uuid,
  heat_number integer,
  stage_number integer,
  scheduled_start timestamptz,
  heat_status text,
  entry_id uuid,
  lane_number integer,
  public_display_name text,
  placement integer,
  final_score numeric,
  result_status text,
  advancement_status text,
  is_mine boolean,
  is_champion boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    heat.cohort_number,
    heat.round_name,
    heat.id,
    heat.heat_number,
    heat.stage_number,
    heat.scheduled_start,
    heat.status,
    entry.id,
    entry.lane_number,
    case
      when registration.user_id = auth.uid() then registration.display_name
      when registration.public_anonymous then 'Anonymous competitor'
      else registration.display_name
    end,
    case when heat.status = 'Final' then entry.placement else null end,
    case when heat.status in ('Review', 'Final') then entry.final_score else null end,
    entry.result_status,
    case
      when heat.status <> 'Final' then 'Awaiting review'
      when entry.advancement_status = 'Tiebreak' then 'Tiebreak required'
      else entry.advancement_status
    end,
    registration.user_id = auth.uid(),
    champion.final_entry_id is not null
  from public.talent7_competition_heats heat
  join public.talent7_competition_heat_entries entry on entry.heat_id = heat.id
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  join public.talent7_competition_campaigns campaign on campaign.id = heat.campaign_id
  left join public.talent7_competition_champions champion on champion.final_entry_id = entry.id
  where heat.campaign_id = target_campaign_id
    and heat.status <> 'Cancelled'
    and campaign.phase in ('Scheduled', 'Live', 'Review', 'Completed')
  order by heat.cohort_number,
    case heat.round_name
      when 'Qualifier' then 1 when 'Round of 32' then 2 when 'Round of 16' then 3
      when 'Quarterfinal' then 4 when 'Semifinal' then 5 when 'Final' then 6 else 7
    end,
    heat.heat_number,
    entry.lane_number;
$$;

create or replace function public.get_talent7_competition_advancement_state(target_campaign_id uuid)
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
    'rules', coalesce((
      select jsonb_agg(to_jsonb(rule) order by rule.cohort_number, rule.created_at)
      from public.talent7_competition_round_advancements rule
      where rule.campaign_id = target_campaign_id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', entry.id,
        'heat_id', heat.id,
        'cohort_number', heat.cohort_number,
        'round_name', heat.round_name,
        'heat_number', heat.heat_number,
        'display_name', registration.display_name,
        'placement', entry.placement,
        'result_status', entry.result_status,
        'advancement_status', entry.advancement_status,
        'advancement_note', entry.advancement_note,
        'advancement_manual', entry.advancement_manual,
        'proof_status', coalesce(proof.review_status, 'Missing')
      ) order by heat.cohort_number, heat.scheduled_start, entry.lane_number)
      from public.talent7_competition_heat_entries entry
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      left join public.talent7_competition_heat_proofs proof on proof.heat_entry_id = entry.id
      where heat.campaign_id = target_campaign_id and heat.status = 'Final'
    ), '[]'::jsonb),
    'champions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cohort_number', champion.cohort_number,
        'display_name', registration.display_name,
        'verified_at', champion.verified_at
      ) order by champion.cohort_number)
      from public.talent7_competition_champions champion
      join public.talent7_competition_registrations registration on registration.id = champion.registration_id
      where champion.campaign_id = target_campaign_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_talent7_competition_advancement_decision(
  target_entry_id uuid,
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
  target_heat public.talent7_competition_heats;
  target_entry public.talent7_competition_heat_entries;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_status not in ('Awaiting review', 'Qualified', 'Eliminated', 'Disqualified') then
    raise exception 'Choose a valid advancement decision';
  end if;
  if char_length(coalesce(target_note, '')) > 500 then raise exception 'Keep the decision note under 500 characters'; end if;

  select * into target_entry from public.talent7_competition_heat_entries where id = target_entry_id for update;
  if target_entry.id is null then raise exception 'Heat entry not found'; end if;
  select * into target_heat from public.talent7_competition_heats where id = target_entry.heat_id;
  if target_heat.status <> 'Final' then raise exception 'Finalize the heat before deciding advancement'; end if;
  if exists (
    select 1 from public.talent7_competition_heat_entries next_entry
    where next_entry.advanced_from_entry_id = target_entry.id
  ) then raise exception 'This competitor is already assigned to the next round'; end if;
  if target_status = 'Qualified' and (
    target_entry.result_status <> 'Verified'
    or not exists (
      select 1 from public.talent7_competition_heat_proofs proof
      where proof.heat_entry_id = target_entry.id and proof.review_status = 'Accepted'
    )
  ) then raise exception 'Only a verified result with accepted footage can qualify'; end if;

  update public.talent7_competition_heat_entries
  set advancement_status = target_status,
      advancement_note = nullif(btrim(target_note), ''),
      advancement_manual = target_status <> 'Awaiting review',
      advancement_decided_by = case when target_status = 'Awaiting review' then null else acting_user end,
      advancement_decided_at = case when target_status = 'Awaiting review' then null else now() end,
      updated_at = now()
  where id = target_entry.id;

  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_heat.campaign_id, acting_user, 'Advancement decision updated', jsonb_build_object(
    'entry_id', target_entry.id, 'heat_id', target_heat.id, 'status', target_status
  ));
end;
$$;

create or replace function public.generate_talent7_competition_next_round(
  target_campaign_id uuid,
  target_cohort_number integer,
  target_source_round text,
  target_next_round text,
  target_qualifiers_per_heat integer,
  target_max_lanes integer,
  target_parallel_stages integer,
  target_first_start timestamptz,
  target_interval_minutes integer,
  target_duration_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  campaign public.talent7_competition_campaigns;
  source_heat record;
  qualifier record;
  generated_heat public.talent7_competition_heats;
  source_order integer;
  next_order integer;
  eligible_count integer;
  expected_count integer;
  chosen_count integer;
  manual_count integer;
  total_qualified integer;
  target_heat_count integer;
  next_heat_number integer;
  next_lane_number integer;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  select * into campaign from public.talent7_competition_campaigns where id = target_campaign_id for update;
  if campaign.id is null then raise exception 'Competition campaign not found'; end if;
  if campaign.phase not in ('Scheduled', 'Live', 'Review') then raise exception 'The competition must be scheduled or active'; end if;
  if target_cohort_number is null or target_cohort_number < 1 then raise exception 'Choose a valid cohort'; end if;
  if target_qualifiers_per_heat not between 1 and 3 then raise exception 'Choose between one and three qualifiers per heat'; end if;
  if target_max_lanes not between 2 and 4 then raise exception 'Next-round heats need two to four lanes'; end if;
  if target_parallel_stages not between 1 and 8 then raise exception 'Choose one to eight parallel stages'; end if;
  if target_first_start is null or target_first_start <= now() then raise exception 'Choose a future next-round start'; end if;
  if target_interval_minutes not between 1 and 120 then raise exception 'Heat interval must be between 1 and 120 minutes'; end if;
  if target_duration_seconds not between 10 and 3600 then raise exception 'Heat duration must be between 10 and 3600 seconds'; end if;

  source_order := case target_source_round
    when 'Qualifier' then 1 when 'Round of 32' then 2 when 'Round of 16' then 3
    when 'Quarterfinal' then 4 when 'Semifinal' then 5 else 0 end;
  next_order := case target_next_round
    when 'Round of 32' then 2 when 'Round of 16' then 3 when 'Quarterfinal' then 4
    when 'Semifinal' then 5 when 'Final' then 6 else 0 end;
  if source_order = 0 or next_order = 0 or next_order <= source_order then
    raise exception 'Choose a later valid next round';
  end if;
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_next_round
  ) then raise exception 'The next round already has heats for this cohort'; end if;
  if not exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_source_round and heat.status <> 'Cancelled'
  ) then raise exception 'No source-round heats were found'; end if;
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_source_round and heat.status not in ('Final', 'Cancelled')
  ) then raise exception 'Finalize every source-round heat before advancing competitors'; end if;

  for source_heat in
    select heat.id, heat.heat_number
    from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_source_round and heat.status = 'Final'
    order by heat.heat_number
  loop
    select count(*)::integer into eligible_count
    from public.talent7_competition_heat_entries entry
    where entry.heat_id = source_heat.id and entry.result_status = 'Verified'
      and entry.check_in_status = 'Checked in' and entry.placement is not null;
    expected_count := least(target_qualifiers_per_heat, eligible_count);
    if expected_count = 0 then raise exception 'Heat % has no verified finisher', source_heat.heat_number; end if;

    select count(*)::integer into manual_count
    from public.talent7_competition_heat_entries entry
    where entry.heat_id = source_heat.id and entry.advancement_manual;

    if manual_count > 0 then
      select count(*)::integer into chosen_count
      from public.talent7_competition_heat_entries entry
      where entry.heat_id = source_heat.id and entry.advancement_status = 'Qualified';
      if chosen_count <> expected_count then
        raise exception 'Heat % needs exactly % manually qualified competitors; every lane must have a clear decision', source_heat.heat_number, expected_count;
      end if;
      if exists (
        select 1 from public.talent7_competition_heat_entries entry
        where entry.heat_id = source_heat.id
          and entry.advancement_status not in ('Qualified', 'Eliminated', 'Disqualified')
      ) then raise exception 'Complete every manual advancement decision in heat %', source_heat.heat_number; end if;
    else
      select count(*)::integer into chosen_count
      from public.talent7_competition_heat_entries entry
      where entry.heat_id = source_heat.id and entry.result_status = 'Verified'
        and entry.check_in_status = 'Checked in' and entry.placement <= expected_count;
      if chosen_count <> expected_count then
        update public.talent7_competition_heat_entries entry
        set advancement_status = 'Tiebreak', updated_at = now()
        where entry.heat_id = source_heat.id and entry.placement = expected_count;
        raise exception 'Heat % has a tie at the qualification line. Set manual decisions or run a tiebreak', source_heat.heat_number;
      end if;
      update public.talent7_competition_heat_entries entry
      set advancement_status = case
            when entry.result_status = 'Verified' and entry.check_in_status = 'Checked in' and entry.placement <= expected_count then 'Qualified'
            when entry.result_status = 'Rejected' or entry.check_in_status = 'No show' then 'Disqualified'
            else 'Eliminated'
          end,
          advancement_note = 'Applied from verified placement',
          advancement_decided_by = acting_user,
          advancement_decided_at = now(),
          updated_at = now()
      where entry.heat_id = source_heat.id;
    end if;

    if exists (
      select 1 from public.talent7_competition_heat_entries entry
      left join public.talent7_competition_heat_proofs proof on proof.heat_entry_id = entry.id
      where entry.heat_id = source_heat.id and entry.advancement_status = 'Qualified'
        and coalesce(proof.review_status, 'Missing') <> 'Accepted'
    ) then raise exception 'Accept the qualifying footage in heat % before generating the next round', source_heat.heat_number; end if;
  end loop;

  select count(*)::integer into total_qualified
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_heats heat on heat.id = entry.heat_id
  where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
    and heat.round_name = target_source_round and heat.status = 'Final'
    and entry.advancement_status = 'Qualified';
  if total_qualified < 2 then raise exception 'At least two verified qualifiers are required for another round'; end if;

  target_heat_count := ceil(total_qualified::numeric / target_max_lanes)::integer;
  for next_heat_number in 1..target_heat_count loop
    insert into public.talent7_competition_heats (
      campaign_id, cohort_number, round_name, heat_number, stage_number,
      max_lanes, duration_seconds, scheduled_start
    ) values (
      target_campaign_id, target_cohort_number, target_next_round, next_heat_number,
      ((next_heat_number - 1) % target_parallel_stages) + 1,
      target_max_lanes, target_duration_seconds,
      target_first_start + (
        floor((next_heat_number - 1)::numeric / target_parallel_stages)::integer
        * target_interval_minutes * interval '1 minute'
      )
    );
  end loop;

  for qualifier in
    select entry.id, entry.registration_id, entry.placement, heat.heat_number as source_heat_number
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_source_round and entry.advancement_status = 'Qualified'
    order by entry.placement, heat.heat_number, entry.lane_number
  loop
    -- Shift each placement seed across the next-round heats. When enough heats
    -- exist, competitors from the same source heat do not immediately rematch.
    next_heat_number := ((qualifier.source_heat_number - 1 + qualifier.placement - 1) % target_heat_count) + 1;
    select * into generated_heat
    from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_next_round and heat.heat_number = next_heat_number;
    select count(*)::integer + 1 into next_lane_number
    from public.talent7_competition_heat_entries entry
    where entry.heat_id = generated_heat.id;
    if next_lane_number > target_max_lanes then
      -- Very uneven/manual seed sets can overflow the preferred heat. Put the
      -- competitor into the least-filled heat while retaining deterministic order.
      select heat.*
      into generated_heat
      from public.talent7_competition_heats heat
      left join public.talent7_competition_heat_entries entry on entry.heat_id = heat.id
      where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
        and heat.round_name = target_next_round
      group by heat.id
      having count(entry.id) < target_max_lanes
      order by count(entry.id), heat.heat_number
      limit 1;
      select count(*)::integer + 1 into next_lane_number
      from public.talent7_competition_heat_entries entry
      where entry.heat_id = generated_heat.id;
    end if;
    insert into public.talent7_competition_heat_entries (
      heat_id, registration_id, lane_number, advanced_from_entry_id
    ) values (generated_heat.id, qualifier.registration_id, next_lane_number, qualifier.id);
  end loop;

  insert into public.talent7_competition_round_advancements (
    campaign_id, cohort_number, source_round_name, next_round_name, qualifiers_per_heat,
    qualified_count, next_heat_count, status, blocker_summary, generated_by, generated_at, updated_at
  ) values (
    target_campaign_id, target_cohort_number, target_source_round, target_next_round, target_qualifiers_per_heat,
    total_qualified, target_heat_count, 'Generated', null, acting_user, now(), now()
  ) on conflict (campaign_id, cohort_number, source_round_name) do update set
    next_round_name = excluded.next_round_name,
    qualifiers_per_heat = excluded.qualifiers_per_heat,
    qualified_count = excluded.qualified_count,
    next_heat_count = excluded.next_heat_count,
    status = 'Generated', blocker_summary = null,
    generated_by = acting_user, generated_at = now(), updated_at = now();

  for qualifier in
    select registration.user_id
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = target_source_round and entry.advancement_status = 'Qualified'
  loop
    perform public.enqueue_push_notification(
      qualifier.user_id, acting_user, 'Competition update', 'You qualified for ' || target_next_round,
      'Your verified result advanced you to the next Talent7 round. Open the competition board for your new heat.',
      '#community-competition', 'competition_heat', target_campaign_id
    );
  end loop;

  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_campaign_id, acting_user, 'Next competition round generated', jsonb_build_object(
    'cohort', target_cohort_number, 'source_round', target_source_round, 'next_round', target_next_round,
    'qualifiers', total_qualified, 'heats', target_heat_count
  ));
  return jsonb_build_object('qualified_count', total_qualified, 'heat_count', target_heat_count, 'next_round', target_next_round);
end;
$$;

create or replace function public.verify_talent7_competition_champion(
  target_campaign_id uuid,
  target_cohort_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  winner record;
  winner_count integer;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
      and heat.round_name = 'Final' and heat.status not in ('Final', 'Cancelled')
  ) then raise exception 'Finalize the final heat before verifying a champion'; end if;
  select count(*)::integer into winner_count
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_heats heat on heat.id = entry.heat_id
  where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
    and heat.round_name = 'Final' and heat.status = 'Final'
    and entry.result_status = 'Verified' and entry.placement = 1;
  if winner_count <> 1 then raise exception 'The final must have exactly one verified first-place result'; end if;

  select entry.id as entry_id, entry.registration_id, registration.user_id, registration.display_name
  into winner
  from public.talent7_competition_heat_entries entry
  join public.talent7_competition_heats heat on heat.id = entry.heat_id
  join public.talent7_competition_registrations registration on registration.id = entry.registration_id
  where heat.campaign_id = target_campaign_id and heat.cohort_number = target_cohort_number
    and heat.round_name = 'Final' and heat.status = 'Final'
    and entry.result_status = 'Verified' and entry.placement = 1;
  if not exists (
    select 1 from public.talent7_competition_heat_proofs proof
    where proof.heat_entry_id = winner.entry_id and proof.review_status = 'Accepted'
  ) then raise exception 'Accept the winning footage before verifying the champion'; end if;

  update public.talent7_competition_heat_entries entry
  set advancement_status = case when entry.id = winner.entry_id then 'Qualified' else 'Eliminated' end,
      advancement_note = case when entry.id = winner.entry_id then 'Verified cohort champion' else 'Final completed' end,
      advancement_decided_by = acting_user, advancement_decided_at = now(), updated_at = now()
  from public.talent7_competition_heats heat
  where entry.heat_id = heat.id and heat.campaign_id = target_campaign_id
    and heat.cohort_number = target_cohort_number and heat.round_name = 'Final';

  insert into public.talent7_competition_champions (
    campaign_id, cohort_number, registration_id, final_entry_id, verified_by
  ) values (target_campaign_id, target_cohort_number, winner.registration_id, winner.entry_id, acting_user)
  on conflict (campaign_id, cohort_number) do update set
    registration_id = excluded.registration_id, final_entry_id = excluded.final_entry_id,
    verified_by = acting_user, verified_at = now();

  perform public.enqueue_push_notification(
    winner.user_id, acting_user, 'Competition champion', 'You are a verified Talent7 champion',
    'Your final result and footage are verified. Your champion record is now on the public progress board.',
    '#community-competition', 'competition_heat', target_campaign_id
  );
  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_campaign_id, acting_user, 'Competition champion verified', jsonb_build_object(
    'cohort', target_cohort_number, 'entry_id', winner.entry_id, 'registration_id', winner.registration_id
  ));
  return jsonb_build_object('display_name', winner.display_name, 'cohort_number', target_cohort_number);
end;
$$;

revoke all on function public.get_talent7_competition_progress_board(uuid) from public;
revoke all on function public.get_talent7_competition_advancement_state(uuid) from public;
revoke all on function public.set_talent7_competition_advancement_decision(uuid, text, text) from public;
revoke all on function public.generate_talent7_competition_next_round(uuid, integer, text, text, integer, integer, integer, timestamptz, integer, integer) from public;
revoke all on function public.verify_talent7_competition_champion(uuid, integer) from public;

grant execute on function public.get_talent7_competition_progress_board(uuid) to anon, authenticated;
grant execute on function public.get_talent7_competition_advancement_state(uuid) to authenticated;
grant execute on function public.set_talent7_competition_advancement_decision(uuid, text, text) to authenticated;
grant execute on function public.generate_talent7_competition_next_round(uuid, integer, text, text, integer, integer, integer, timestamptz, integer, integer) to authenticated;
grant execute on function public.verify_talent7_competition_champion(uuid, integer) to authenticated;

comment on table public.talent7_competition_round_advancements is
  'Organizer-audited, proof-gated generation of later competition rounds.';
comment on table public.talent7_competition_champions is
  'One verified champion record per campaign cohort, created only from an accepted final result and proof.';

commit;
