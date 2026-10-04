-- Talent7 opt-in standby queue and audited no-show lane replacement.
-- Run after add-community-competition-disputes-safety.sql.

begin;

create table if not exists public.talent7_competition_standby_profiles (
  registration_id uuid primary key references public.talent7_competition_registrations(id) on delete cascade,
  available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent7_competition_standby_offers (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  heat_id uuid not null references public.talent7_competition_heats(id) on delete cascade,
  source_entry_id uuid references public.talent7_competition_heat_entries(id) on delete set null,
  source_registration_id uuid references public.talent7_competition_registrations(id) on delete set null,
  source_display_name text not null,
  source_cohort_number integer not null,
  source_slot_number integer not null,
  lane_number integer not null check (lane_number between 1 and 4),
  offered_registration_id uuid not null references public.talent7_competition_registrations(id) on delete cascade,
  offered_original_cohort integer not null,
  offered_original_slot integer not null,
  status text not null default 'Offered'
    check (status in ('Offered', 'Accepted', 'Declined', 'Expired', 'Cancelled')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  accepted_entry_id uuid references public.talent7_competition_heat_entries(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(source_display_name) between 1 and 80)
);

create unique index if not exists talent7_competition_standby_offers_active_source_idx
on public.talent7_competition_standby_offers (source_entry_id)
where status = 'Offered' and source_entry_id is not null;

create unique index if not exists talent7_competition_standby_offers_active_candidate_idx
on public.talent7_competition_standby_offers (offered_registration_id)
where status = 'Offered';

create index if not exists talent7_competition_standby_offers_campaign_idx
on public.talent7_competition_standby_offers (campaign_id, status, created_at desc);

alter table public.talent7_competition_standby_profiles enable row level security;
alter table public.talent7_competition_standby_offers enable row level security;
revoke all on public.talent7_competition_standby_profiles from anon, authenticated;
revoke all on public.talent7_competition_standby_offers from anon, authenticated;

create or replace function public.expire_talent7_competition_standby_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare expired_count integer;
begin
  update public.talent7_competition_standby_offers
  set status = 'Expired', responded_at = now(), updated_at = now()
  where status = 'Offered' and expires_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.set_my_talent7_competition_standby_availability(
  target_campaign_id uuid,
  target_available boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_registration public.talent7_competition_registrations;
begin
  if acting_user is null then raise exception 'Log in to manage standby availability'; end if;
  select * into target_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user;
  if target_registration.id is null then raise exception 'Register for this competition before joining standby'; end if;
  if target_registration.status not in ('Interested', 'Confirmed') then
    raise exception 'This registration is not eligible for standby';
  end if;

  insert into public.talent7_competition_standby_profiles (registration_id, available)
  values (target_registration.id, coalesce(target_available, false))
  on conflict (registration_id) do update
    set available = excluded.available, updated_at = now();

  if not coalesce(target_available, false) then
    update public.talent7_competition_standby_offers
    set status = 'Declined', responded_at = now(), updated_at = now()
    where offered_registration_id = target_registration.id and status = 'Offered';
  end if;
  return coalesce(target_available, false);
end;
$$;

create or replace function public.get_my_talent7_competition_standby_state(target_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_registration_id uuid;
begin
  if acting_user is null then raise exception 'Log in to view standby offers'; end if;
  perform public.expire_talent7_competition_standby_offers();
  select registration.id into target_registration_id
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user;

  if target_registration_id is null then
    return jsonb_build_object('registered', false, 'available', false, 'offers', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'registered', true,
    'available', coalesce((
      select profile.available from public.talent7_competition_standby_profiles profile
      where profile.registration_id = target_registration_id
    ), false),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', offer.id, 'status', offer.status, 'expires_at', offer.expires_at,
        'heat_id', heat.id, 'cohort_number', heat.cohort_number,
        'round_name', heat.round_name, 'heat_number', heat.heat_number,
        'stage_number', heat.stage_number, 'lane_number', offer.lane_number,
        'scheduled_start', heat.scheduled_start, 'duration_seconds', heat.duration_seconds,
        'created_at', offer.created_at
      ) order by offer.created_at desc)
      from public.talent7_competition_standby_offers offer
      join public.talent7_competition_heats heat on heat.id = offer.heat_id
      where offer.offered_registration_id = target_registration_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_talent7_competition_standby_admin_state(target_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = auth.uid()
  ) then raise exception 'Talent7 organizer access required'; end if;
  perform public.expire_talent7_competition_standby_offers();

  return jsonb_build_object(
    'candidate_count', (
      select count(*)
      from public.talent7_competition_registrations registration
      join public.talent7_competition_standby_profiles profile on profile.registration_id = registration.id
      where registration.campaign_id = target_campaign_id
        and registration.status in ('Interested', 'Confirmed')
        and profile.available
        and not exists (
          select 1 from public.talent7_competition_heat_entries entry
          join public.talent7_competition_heats heat on heat.id = entry.heat_id
          where entry.registration_id = registration.id and heat.status <> 'Cancelled'
        )
        and not exists (
          select 1 from public.talent7_competition_standby_offers active_offer
          where active_offer.offered_registration_id = registration.id and active_offer.status = 'Offered'
        )
    ),
    'vacancies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', entry.id, 'heat_id', heat.id, 'display_name', registration.display_name,
        'cohort_number', heat.cohort_number, 'round_name', heat.round_name,
        'heat_number', heat.heat_number, 'stage_number', heat.stage_number,
        'lane_number', entry.lane_number, 'scheduled_start', heat.scheduled_start
      ) order by heat.scheduled_start, heat.heat_number, entry.lane_number)
      from public.talent7_competition_heat_entries entry
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      where heat.campaign_id = target_campaign_id
        and heat.round_name = 'Qualifier'
        and heat.status in ('Draft', 'Check-in')
        and entry.check_in_status = 'No show'
        and not exists (select 1 from public.talent7_competition_heat_proofs proof where proof.heat_entry_id = entry.id)
        and not exists (
          select 1 from public.talent7_competition_standby_offers active_offer
          where active_offer.source_entry_id = entry.id and active_offer.status = 'Offered'
        )
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', offer.id, 'status', offer.status, 'expires_at', offer.expires_at,
        'source_entry_id', offer.source_entry_id, 'source_display_name', offer.source_display_name,
        'candidate_name', candidate.display_name, 'cohort_number', heat.cohort_number,
        'round_name', heat.round_name, 'heat_number', heat.heat_number,
        'lane_number', offer.lane_number, 'created_at', offer.created_at
      ) order by offer.created_at desc)
      from (
        select * from public.talent7_competition_standby_offers
        where campaign_id = target_campaign_id order by created_at desc limit 30
      ) offer
      join public.talent7_competition_heats heat on heat.id = offer.heat_id
      join public.talent7_competition_registrations candidate on candidate.id = offer.offered_registration_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.offer_next_talent7_competition_standby(
  target_source_entry_id uuid,
  target_expiry_minutes integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  source_entry public.talent7_competition_heat_entries;
  source_registration public.talent7_competition_registrations;
  target_heat public.talent7_competition_heats;
  candidate public.talent7_competition_registrations;
  saved_offer_id uuid;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_expiry_minutes not between 5 and 60 then raise exception 'Standby offers must remain open for 5 to 60 minutes'; end if;
  perform public.expire_talent7_competition_standby_offers();

  select * into source_entry from public.talent7_competition_heat_entries
  where id = target_source_entry_id for update;
  if source_entry.id is null then raise exception 'The vacant lane was not found'; end if;
  select * into target_heat from public.talent7_competition_heats where id = source_entry.heat_id for update;
  select * into source_registration from public.talent7_competition_registrations where id = source_entry.registration_id;
  if target_heat.round_name <> 'Qualifier' or target_heat.status not in ('Draft', 'Check-in') or source_entry.check_in_status <> 'No show' then
    raise exception 'Only a qualifier no-show lane in Draft or Check-in can receive a standby replacement';
  end if;
  if exists (select 1 from public.talent7_competition_heat_proofs where heat_entry_id = source_entry.id) then
    raise exception 'A lane with submitted proof cannot be reassigned';
  end if;
  if exists (
    select 1 from public.talent7_competition_standby_offers offer
    where offer.source_entry_id = source_entry.id and offer.status = 'Offered'
  ) then raise exception 'This lane already has an active standby offer'; end if;

  select registration.* into candidate
  from public.talent7_competition_registrations registration
  join public.talent7_competition_standby_profiles profile on profile.registration_id = registration.id
  where registration.campaign_id = target_heat.campaign_id
    and registration.id <> source_registration.id
    and registration.status in ('Interested', 'Confirmed')
    and profile.available
    and not exists (
      select 1 from public.talent7_competition_heat_entries entry
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      where entry.registration_id = registration.id and heat.status <> 'Cancelled'
    )
    and not exists (
      select 1 from public.talent7_competition_standby_offers active_offer
      where active_offer.offered_registration_id = registration.id and active_offer.status = 'Offered'
    )
    and not exists (
      select 1 from public.talent7_competition_standby_offers previous_offer
      where previous_offer.source_entry_id = source_entry.id
        and previous_offer.offered_registration_id = registration.id
        and previous_offer.status in ('Declined', 'Expired')
    )
  order by registration.cohort_number, registration.slot_number, registration.created_at
  limit 1
  for update of registration skip locked;
  if candidate.id is null then raise exception 'No eligible opted-in standby member is currently available'; end if;

  insert into public.talent7_competition_standby_offers (
    campaign_id, heat_id, source_entry_id, source_registration_id, source_display_name,
    source_cohort_number, source_slot_number, lane_number, offered_registration_id,
    offered_original_cohort, offered_original_slot, expires_at, created_by
  ) values (
    target_heat.campaign_id, target_heat.id, source_entry.id, source_registration.id,
    source_registration.display_name, source_registration.cohort_number, source_registration.slot_number,
    source_entry.lane_number, candidate.id, candidate.cohort_number, candidate.slot_number,
    now() + make_interval(mins => target_expiry_minutes), acting_user
  ) returning id into saved_offer_id;

  perform public.enqueue_push_notification(
    candidate.user_id, acting_user, 'Challenge update', 'A tournament lane is available',
    'A standby place is waiting for your approval. Open your competition desk before the offer expires.',
    '#community-competition', 'competition_heat', saved_offer_id
  );
  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_heat.campaign_id, acting_user, 'Standby offer created', jsonb_build_object(
    'offer_id', saved_offer_id, 'heat_id', target_heat.id, 'lane', source_entry.lane_number,
    'source_registration_id', source_registration.id, 'candidate_registration_id', candidate.id
  ));
  return saved_offer_id;
end;
$$;

create or replace function public.respond_to_talent7_competition_standby_offer(
  target_offer_id uuid,
  target_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_offer public.talent7_competition_standby_offers;
  target_heat public.talent7_competition_heats;
  source_entry public.talent7_competition_heat_entries;
  source_registration public.talent7_competition_registrations;
  candidate public.talent7_competition_registrations;
  new_entry_id uuid;
begin
  if acting_user is null then raise exception 'Log in to answer the standby offer'; end if;
  select * into target_offer from public.talent7_competition_standby_offers
  where id = target_offer_id for update;
  if target_offer.id is null then raise exception 'Standby offer not found'; end if;
  select * into candidate from public.talent7_competition_registrations
  where id = target_offer.offered_registration_id for update;
  if candidate.user_id <> acting_user then raise exception 'This standby offer belongs to another member'; end if;
  if target_offer.status <> 'Offered' then raise exception 'This standby offer is no longer active'; end if;
  if target_offer.expires_at <= now() then
    update public.talent7_competition_standby_offers
    set status = 'Expired', responded_at = now(), updated_at = now() where id = target_offer.id;
    raise exception 'This standby offer has expired';
  end if;

  if not coalesce(target_accept, false) then
    update public.talent7_competition_standby_offers
    set status = 'Declined', responded_at = now(), updated_at = now() where id = target_offer.id;
    return null;
  end if;

  select * into target_heat from public.talent7_competition_heats where id = target_offer.heat_id for update;
  select * into source_entry from public.talent7_competition_heat_entries
  where id = target_offer.source_entry_id for update;
  if source_entry.id is null or target_heat.round_name <> 'Qualifier' or target_heat.status not in ('Draft', 'Check-in') or source_entry.check_in_status <> 'No show' then
    raise exception 'The lane is no longer available';
  end if;
  if exists (select 1 from public.talent7_competition_heat_proofs where heat_entry_id = source_entry.id) then
    raise exception 'A lane with submitted proof cannot be reassigned';
  end if;
  if exists (
    select 1 from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    where entry.registration_id = candidate.id and heat.status <> 'Cancelled'
  ) then raise exception 'You already have an active heat assignment'; end if;
  select * into source_registration from public.talent7_competition_registrations
  where id = source_entry.registration_id;

  delete from public.talent7_competition_heat_entries where id = source_entry.id;
  insert into public.talent7_competition_heat_entries (heat_id, registration_id, lane_number)
  values (target_heat.id, candidate.id, target_offer.lane_number)
  returning id into new_entry_id;

  update public.talent7_competition_registrations
  set status = 'Confirmed', cohort_number = target_heat.cohort_number, updated_at = now()
  where id = candidate.id;
  update public.talent7_competition_standby_profiles
  set available = false, updated_at = now() where registration_id = candidate.id;
  update public.talent7_competition_standby_offers
  set status = 'Accepted', responded_at = now(), accepted_entry_id = new_entry_id, updated_at = now()
  where id = target_offer.id;

  update public.talent7_competition_standby_offers
  set status = 'Cancelled', responded_at = now(), updated_at = now()
  where source_entry_id = source_entry.id and id <> target_offer.id and status = 'Offered';

  perform public.enqueue_push_notification(
    candidate.user_id, acting_user, 'Challenge update', 'Your standby lane is confirmed',
    'You accepted the available tournament lane. Open your competition desk for the heat time and check-in.',
    '#community-competition', 'competition_heat', new_entry_id
  );
  if source_registration.user_id is not null then
    perform public.enqueue_push_notification(
      source_registration.user_id, acting_user, 'Challenge update', 'Tournament lane released',
      'Your no-show lane was reassigned to an opted-in standby member. Contact support if this is incorrect.',
      '#community-competition', 'competition_heat', target_offer.id
    );
  end if;
  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_heat.campaign_id, target_offer.created_by, 'Standby replacement accepted', jsonb_build_object(
    'offer_id', target_offer.id, 'heat_id', target_heat.id, 'lane', target_offer.lane_number,
    'source_registration_id', source_registration.id, 'replacement_registration_id', candidate.id,
    'replacement_entry_id', new_entry_id
  ));
  return new_entry_id;
end;
$$;

revoke all on function public.expire_talent7_competition_standby_offers() from public;
revoke all on function public.set_my_talent7_competition_standby_availability(uuid, boolean) from public;
revoke all on function public.get_my_talent7_competition_standby_state(uuid) from public;
revoke all on function public.get_talent7_competition_standby_admin_state(uuid) from public;
revoke all on function public.offer_next_talent7_competition_standby(uuid, integer) from public;
revoke all on function public.respond_to_talent7_competition_standby_offer(uuid, boolean) from public;

grant execute on function public.set_my_talent7_competition_standby_availability(uuid, boolean) to authenticated;
grant execute on function public.get_my_talent7_competition_standby_state(uuid) to authenticated;
grant execute on function public.get_talent7_competition_standby_admin_state(uuid) to authenticated;
grant execute on function public.offer_next_talent7_competition_standby(uuid, integer) to authenticated;
grant execute on function public.respond_to_talent7_competition_standby_offer(uuid, boolean) to authenticated;

do $setup_standby_expiry_cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'talent7-competition-standby-expiry') then
      perform cron.schedule(
        'talent7-competition-standby-expiry', '* * * * *',
        'select public.expire_talent7_competition_standby_offers();'
      );
    end if;
  end if;
end;
$setup_standby_expiry_cron$;

comment on table public.talent7_competition_standby_profiles is
  'Participant-controlled standby availability. Opt-in never reassigns a lane without a separate accepted offer.';
comment on table public.talent7_competition_standby_offers is
  'Private, expiring, organizer-audited offers that replace only pre-start qualifier no-show entries.';

commit;
