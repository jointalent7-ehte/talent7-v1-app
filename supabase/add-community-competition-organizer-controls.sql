-- Talent7 private organizer controls for community-shaped competitions.
-- Run after add-community-competition-launchpad.sql.

begin;

alter table public.talent7_competition_campaigns
  add column if not exists selected_day_option_id uuid,
  add column if not exists selected_time_option_id uuid;

alter table public.talent7_competition_campaigns
  drop constraint if exists talent7_competition_campaigns_selected_day_option_id_fkey;
alter table public.talent7_competition_campaigns
  add constraint talent7_competition_campaigns_selected_day_option_id_fkey
  foreign key (selected_day_option_id)
  references public.talent7_competition_schedule_options(id)
  on delete set null;

alter table public.talent7_competition_campaigns
  drop constraint if exists talent7_competition_campaigns_selected_time_option_id_fkey;
alter table public.talent7_competition_campaigns
  add constraint talent7_competition_campaigns_selected_time_option_id_fkey
  foreign key (selected_time_option_id)
  references public.talent7_competition_schedule_options(id)
  on delete set null;

create table if not exists public.talent7_competition_admin_actions (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(action) between 3 and 100)
);

create index if not exists talent7_competition_admin_actions_campaign_idx
on public.talent7_competition_admin_actions (campaign_id, created_at desc);

alter table public.talent7_competition_admin_actions enable row level security;
revoke all on public.talent7_competition_admin_actions from anon, authenticated;

create or replace function public.get_talent7_competition_organizer_state(target_campaign_id uuid)
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
    'pending_nominations', coalesce((
      select jsonb_agg(to_jsonb(option) - 'proposed_by' order by option.created_at asc)
      from public.talent7_competition_options option
      where option.campaign_id = target_campaign_id
        and option.moderation_status = 'Pending'
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(
        (to_jsonb(registration) - 'user_id')
        order by registration.cohort_number, registration.slot_number
      )
      from public.talent7_competition_registrations registration
      where registration.campaign_id = target_campaign_id
        and registration.status <> 'Withdrawn'
    ), '[]'::jsonb),
    'selected_day_option_id', (
      select campaign.selected_day_option_id
      from public.talent7_competition_campaigns campaign
      where campaign.id = target_campaign_id
    ),
    'selected_time_option_id', (
      select campaign.selected_time_option_id
      from public.talent7_competition_campaigns campaign
      where campaign.id = target_campaign_id
    ),
    'recent_actions', coalesce((
      select jsonb_agg(to_jsonb(action) - 'admin_user_id' order by action.created_at desc)
      from (
        select *
        from public.talent7_competition_admin_actions log
        where log.campaign_id = target_campaign_id
        order by log.created_at desc
        limit 20
      ) action
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.review_talent7_competition_nomination(
  target_option_id uuid,
  target_decision text
)
returns public.talent7_competition_options
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_option public.talent7_competition_options;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_decision not in ('Approved', 'Rejected') then raise exception 'Choose Approve or Reject'; end if;

  update public.talent7_competition_options
  set moderation_status = target_decision, updated_at = now()
  where id = target_option_id
    and option_kind = 'Community'
    and moderation_status = 'Pending'
  returning * into saved_option;
  if saved_option.id is null then raise exception 'Pending nomination not found'; end if;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    saved_option.campaign_id,
    acting_user,
    'Nomination ' || lower(target_decision),
    jsonb_build_object('option_id', saved_option.id, 'activity', saved_option.activity)
  );
  return saved_option;
end;
$$;

create or replace function public.save_talent7_competition_schedule_option(
  target_campaign_id uuid,
  target_phase text,
  target_label text,
  target_proposed_start timestamptz default null
)
returns public.talent7_competition_schedule_options
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_option public.talent7_competition_schedule_options;
  next_sort integer;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if not exists (select 1 from public.talent7_competition_campaigns where id = target_campaign_id) then
    raise exception 'Competition campaign not found';
  end if;
  if target_phase not in ('Day vote', 'Time vote') then raise exception 'Choose a day or time vote'; end if;
  target_label := btrim(coalesce(target_label, ''));
  if char_length(target_label) not between 2 and 80 then raise exception 'Keep the option label between 2 and 80 characters'; end if;

  select coalesce(max(option.sort_order), 0) + 10 into next_sort
  from public.talent7_competition_schedule_options option
  where option.campaign_id = target_campaign_id and option.phase = target_phase;

  insert into public.talent7_competition_schedule_options (
    campaign_id, phase, label, proposed_start, sort_order
  ) values (
    target_campaign_id, target_phase, target_label, target_proposed_start, next_sort
  )
  on conflict (campaign_id, phase, (lower(label))) do update set
    proposed_start = excluded.proposed_start,
    status = 'Active'
  returning * into saved_option;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    target_campaign_id,
    acting_user,
    'Schedule option saved',
    jsonb_build_object('option_id', saved_option.id, 'phase', target_phase, 'label', target_label)
  );
  return saved_option;
end;
$$;

create or replace function public.remove_talent7_competition_schedule_option(target_option_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_option public.talent7_competition_schedule_options;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;

  select * into target_option
  from public.talent7_competition_schedule_options option
  where option.id = target_option_id
  for update;
  if target_option.id is null then return false; end if;
  if target_option.vote_count > 0 then raise exception 'An option with votes cannot be removed'; end if;
  if exists (
    select 1 from public.talent7_competition_campaigns campaign
    where campaign.selected_day_option_id = target_option.id
       or campaign.selected_time_option_id = target_option.id
  ) then raise exception 'A selected schedule option cannot be removed'; end if;

  delete from public.talent7_competition_schedule_options where id = target_option.id;
  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    target_option.campaign_id,
    acting_user,
    'Schedule option removed',
    jsonb_build_object('phase', target_option.phase, 'label', target_option.label)
  );
  return true;
end;
$$;

create or replace function public.advance_talent7_competition_phase(
  target_campaign_id uuid,
  target_next_phase text,
  target_selected_option_id uuid default null,
  target_vote_closes_at timestamptz default null,
  target_scheduled_start timestamptz default null
)
returns public.talent7_competition_campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  campaign public.talent7_competition_campaigns;
  selected_schedule public.talent7_competition_schedule_options;
  saved_campaign public.talent7_competition_campaigns;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;

  select * into campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id
  for update;
  if campaign.id is null then raise exception 'Competition campaign not found'; end if;

  if not (
    (campaign.phase = 'Activity vote' and target_next_phase = 'Day vote')
    or (campaign.phase = 'Day vote' and target_next_phase = 'Time vote')
    or (campaign.phase = 'Time vote' and target_next_phase = 'Registration')
    or (campaign.phase = 'Registration' and target_next_phase = 'Scheduled')
    or (campaign.phase = 'Scheduled' and target_next_phase = 'Live')
    or (campaign.phase = 'Live' and target_next_phase = 'Review')
    or (campaign.phase = 'Review' and target_next_phase = 'Completed')
    or target_next_phase = 'Cancelled'
  ) then raise exception 'Invalid competition phase change'; end if;

  if target_next_phase in ('Day vote', 'Time vote') and (
    target_vote_closes_at is null or target_vote_closes_at <= now()
  ) then raise exception 'Choose a future closing time for the next vote'; end if;

  if target_next_phase = 'Day vote' then
    if not exists (
      select 1 from public.talent7_competition_options option
      where option.id = target_selected_option_id
        and option.campaign_id = campaign.id
        and option.moderation_status = 'Approved'
    ) then raise exception 'Select an approved activity winner'; end if;
    if not exists (
      select 1 from public.talent7_competition_schedule_options option
      where option.campaign_id = campaign.id and option.phase = 'Day vote' and option.status = 'Active'
    ) then raise exception 'Add at least one day choice before opening the day vote'; end if;
  elsif target_next_phase = 'Time vote' then
    select * into selected_schedule
    from public.talent7_competition_schedule_options option
    where option.id = target_selected_option_id
      and option.campaign_id = campaign.id
      and option.phase = 'Day vote'
      and option.status = 'Active';
    if selected_schedule.id is null then raise exception 'Select a day winner'; end if;
    if not exists (
      select 1 from public.talent7_competition_schedule_options option
      where option.campaign_id = campaign.id and option.phase = 'Time vote' and option.status = 'Active'
    ) then raise exception 'Add at least one time choice before opening the time vote'; end if;
  elsif target_next_phase = 'Registration' then
    select * into selected_schedule
    from public.talent7_competition_schedule_options option
    where option.id = target_selected_option_id
      and option.campaign_id = campaign.id
      and option.phase = 'Time vote'
      and option.status = 'Active';
    if selected_schedule.id is null then raise exception 'Select a time winner'; end if;
    if target_scheduled_start is null or target_scheduled_start <= now() then
      raise exception 'Choose the final future event date and time';
    end if;
  elsif target_next_phase = 'Scheduled' then
    target_scheduled_start := coalesce(target_scheduled_start, campaign.scheduled_start);
    if target_scheduled_start is null or target_scheduled_start <= now() then
      raise exception 'Choose a future event date and time';
    end if;
  end if;

  update public.talent7_competition_campaigns
  set phase = target_next_phase,
      selected_activity_option_id = case
        when target_next_phase = 'Day vote' then target_selected_option_id
        else selected_activity_option_id
      end,
      selected_day_option_id = case
        when target_next_phase = 'Time vote' then target_selected_option_id
        else selected_day_option_id
      end,
      selected_time_option_id = case
        when target_next_phase = 'Registration' then target_selected_option_id
        else selected_time_option_id
      end,
      vote_closes_at = case
        when target_next_phase in ('Day vote', 'Time vote') then target_vote_closes_at
        else null
      end,
      scheduled_start = case
        when target_next_phase in ('Registration', 'Scheduled') then target_scheduled_start
        else scheduled_start
      end,
      updated_at = now()
  where id = campaign.id
  returning * into saved_campaign;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    campaign.id,
    acting_user,
    'Phase advanced',
    jsonb_build_object(
      'from', campaign.phase,
      'to', target_next_phase,
      'selected_option_id', target_selected_option_id,
      'vote_closes_at', target_vote_closes_at,
      'scheduled_start', target_scheduled_start
    )
  );
  return saved_campaign;
end;
$$;

create or replace function public.update_talent7_competition_registration_status(
  target_registration_id uuid,
  target_status text
)
returns public.talent7_competition_registrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_registration public.talent7_competition_registrations;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_status not in ('Interested', 'Confirmed', 'Disqualified', 'Completed') then
    raise exception 'Choose a valid entrant status';
  end if;

  update public.talent7_competition_registrations
  set status = target_status, updated_at = now()
  where id = target_registration_id and status <> 'Withdrawn'
  returning * into saved_registration;
  if saved_registration.id is null then raise exception 'Active registration not found'; end if;

  insert into public.talent7_competition_admin_actions (
    campaign_id, admin_user_id, action, details
  ) values (
    saved_registration.campaign_id,
    acting_user,
    'Entrant status updated',
    jsonb_build_object(
      'registration_id', saved_registration.id,
      'cohort', saved_registration.cohort_number,
      'slot', saved_registration.slot_number,
      'status', target_status
    )
  );
  return saved_registration;
end;
$$;

revoke all on function public.get_talent7_competition_organizer_state(uuid) from public;
revoke all on function public.review_talent7_competition_nomination(uuid, text) from public;
revoke all on function public.save_talent7_competition_schedule_option(uuid, text, text, timestamptz) from public;
revoke all on function public.remove_talent7_competition_schedule_option(uuid) from public;
revoke all on function public.advance_talent7_competition_phase(uuid, text, uuid, timestamptz, timestamptz) from public;
revoke all on function public.update_talent7_competition_registration_status(uuid, text) from public;

grant execute on function public.get_talent7_competition_organizer_state(uuid) to authenticated;
grant execute on function public.review_talent7_competition_nomination(uuid, text) to authenticated;
grant execute on function public.save_talent7_competition_schedule_option(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.remove_talent7_competition_schedule_option(uuid) to authenticated;
grant execute on function public.advance_talent7_competition_phase(uuid, text, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.update_talent7_competition_registration_status(uuid, text) to authenticated;

comment on table public.talent7_competition_admin_actions is
  'Private append-only audit history for organizer decisions in community competition campaigns.';

commit;
