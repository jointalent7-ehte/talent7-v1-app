-- Talent7 private competition appeals, incident review, and safety holds.
-- Run after add-community-competition-rehearsal-mode.sql.

begin;

alter table public.talent7_competition_heats
  add column if not exists review_hold boolean not null default false,
  add column if not exists review_hold_reason text,
  add column if not exists review_hold_by uuid references auth.users(id) on delete set null,
  add column if not exists review_hold_at timestamptz,
  add column if not exists finalized_at timestamptz;

update public.talent7_competition_heats
set finalized_at = updated_at
where status = 'Final' and finalized_at is null;

create or replace function public.stamp_talent7_competition_heat_finalized_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Final' and old.status is distinct from 'Final' then
    new.finalized_at = now();
  elsif new.status <> 'Final' then
    new.finalized_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_talent7_competition_heat_finalized_at on public.talent7_competition_heats;
create trigger stamp_talent7_competition_heat_finalized_at
before update of status on public.talent7_competition_heats
for each row execute function public.stamp_talent7_competition_heat_finalized_at();

alter table public.talent7_competition_heats
  drop constraint if exists talent7_competition_heats_review_hold_reason_check;
alter table public.talent7_competition_heats
  add constraint talent7_competition_heats_review_hold_reason_check check (
    review_hold_reason is null or char_length(review_hold_reason) <= 500
  );

create table if not exists public.talent7_competition_cases (
  id uuid primary key default uuid_generate_v4(),
  case_number text not null default ('CASE-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10))) unique,
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  heat_id uuid references public.talent7_competition_heats(id) on delete set null,
  heat_entry_id uuid references public.talent7_competition_heat_entries(id) on delete set null,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('Result appeal', 'Technical issue', 'Conduct concern', 'Safety concern')),
  priority text not null default 'Normal' check (priority in ('Normal', 'Urgent')),
  summary text not null check (char_length(summary) between 10 and 200),
  private_details text not null check (char_length(private_details) between 20 and 2000),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 2000 and evidence_url ~* '^https://')),
  status text not null default 'Submitted'
    check (status in ('Submitted', 'Acknowledged', 'Investigating', 'Resolved', 'Dismissed', 'Withdrawn')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  sensitive_delete_after timestamptz,
  sensitive_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent7_competition_cases_campaign_status_idx
on public.talent7_competition_cases (campaign_id, status, priority, created_at);
create index if not exists talent7_competition_cases_reporter_idx
on public.talent7_competition_cases (reporter_user_id, created_at desc);
create index if not exists talent7_competition_cases_cleanup_idx
on public.talent7_competition_cases (sensitive_delete_after)
where sensitive_deleted_at is null and sensitive_delete_after is not null;

alter table public.talent7_competition_cases enable row level security;
revoke all on public.talent7_competition_cases from anon, authenticated;

create or replace function public.get_my_talent7_competition_case_state(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Log in to open the private review center'; end if;
  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', entry.id, 'heat_id', heat.id, 'cohort_number', heat.cohort_number,
        'round_name', heat.round_name, 'heat_number', heat.heat_number,
        'placement', entry.placement, 'final_score', entry.final_score,
        'heat_status', heat.status, 'review_hold', heat.review_hold,
        'appeal_closes_at', coalesce(heat.finalized_at, heat.updated_at) + interval '48 hours'
      ) order by heat.scheduled_start desc)
      from public.talent7_competition_heat_entries entry
      join public.talent7_competition_heats heat on heat.id = entry.heat_id
      join public.talent7_competition_registrations registration on registration.id = entry.registration_id
      where heat.campaign_id = target_campaign_id and registration.user_id = auth.uid()
    ), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', competition_case.id, 'case_number', competition_case.case_number,
        'heat_id', competition_case.heat_id, 'heat_entry_id', competition_case.heat_entry_id,
        'category', competition_case.category, 'priority', competition_case.priority,
        'summary', competition_case.summary, 'status', competition_case.status,
        'resolution_note', competition_case.resolution_note,
        'created_at', competition_case.created_at, 'updated_at', competition_case.updated_at
      ) order by competition_case.created_at desc)
      from public.talent7_competition_cases competition_case
      where competition_case.campaign_id = target_campaign_id
        and competition_case.reporter_user_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.submit_talent7_competition_case(
  target_campaign_id uuid,
  target_category text,
  target_summary text,
  target_private_details text,
  target_heat_entry_id uuid default null,
  target_evidence_url text default null
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
  saved_id uuid;
  clean_evidence text := nullif(btrim(coalesce(target_evidence_url, '')), '');
  admin_record record;
begin
  if acting_user is null then raise exception 'Log in to submit a private competition case'; end if;
  if target_category not in ('Result appeal', 'Technical issue', 'Conduct concern', 'Safety concern') then raise exception 'Choose a valid case category'; end if;
  if char_length(btrim(coalesce(target_summary, ''))) not between 10 and 200 then raise exception 'Use a summary between 10 and 200 characters'; end if;
  if char_length(btrim(coalesce(target_private_details, ''))) not between 20 and 2000 then raise exception 'Explain the issue in 20 to 2000 characters'; end if;
  if clean_evidence is not null and (char_length(clean_evidence) > 2000 or clean_evidence !~* '^https://') then raise exception 'Evidence must use a valid HTTPS link'; end if;
  if not exists (
    select 1 from public.talent7_competition_registrations registration
    where registration.campaign_id = target_campaign_id and registration.user_id = acting_user
  ) then raise exception 'Only registered competition participants can use this review center'; end if;
  if (
    select count(*) from public.talent7_competition_cases competition_case
    where competition_case.campaign_id = target_campaign_id
      and competition_case.reporter_user_id = acting_user
      and competition_case.status in ('Submitted', 'Acknowledged', 'Investigating')
  ) >= 5 then raise exception 'Resolve an existing open case before submitting another'; end if;

  if target_heat_entry_id is not null then
    select entry.* into target_entry
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where entry.id = target_heat_entry_id and registration.user_id = acting_user;
    if target_entry.id is null then raise exception 'Your heat entry was not found'; end if;
    select * into target_heat from public.talent7_competition_heats where id = target_entry.heat_id;
    if target_heat.campaign_id <> target_campaign_id then raise exception 'Heat entry does not belong to this competition'; end if;
  elsif target_category = 'Result appeal' then
    raise exception 'Choose the finalized result you want reviewed';
  end if;

  if target_category = 'Result appeal' then
    if target_heat.status <> 'Final' then raise exception 'Result appeals open only after the heat is finalized'; end if;
    if now() > coalesce(target_heat.finalized_at, target_heat.updated_at) + interval '48 hours' then raise exception 'The 48-hour result appeal window has closed'; end if;
  end if;

  insert into public.talent7_competition_cases (
    campaign_id, heat_id, heat_entry_id, reporter_user_id, category, priority,
    summary, private_details, evidence_url
  ) values (
    target_campaign_id, target_heat.id, target_entry.id, acting_user, target_category,
    case when target_category = 'Safety concern' then 'Urgent' else 'Normal' end,
    btrim(target_summary), btrim(target_private_details), clean_evidence
  ) returning id into saved_id;

  for admin_record in select app_admin.user_id from public.app_admins app_admin loop
    perform public.enqueue_push_notification(
      admin_record.user_id, acting_user, 'Proof and result',
      case when target_category = 'Safety concern' then 'Urgent competition safety case' else 'New private competition case' end,
      'A registered participant submitted a private ' || lower(target_category) || '. Open the organizer review desk.',
      '#community-competition', 'competition_heat', saved_id
    );
  end loop;
  return saved_id;
end;
$$;

create or replace function public.withdraw_my_talent7_competition_case(target_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.talent7_competition_cases
  set status = 'Withdrawn', resolved_at = now(), sensitive_delete_after = now() + interval '180 days', updated_at = now()
  where id = target_case_id and reporter_user_id = auth.uid() and status in ('Submitted', 'Acknowledged');
  if not found then raise exception 'This case can no longer be withdrawn'; end if;
end;
$$;

create or replace function public.get_talent7_competition_case_admin_state(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.app_admins where app_admins.user_id = auth.uid()) then raise exception 'Talent7 organizer access required'; end if;
  return jsonb_build_object(
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', competition_case.id, 'case_number', competition_case.case_number,
        'heat_id', competition_case.heat_id, 'heat_entry_id', competition_case.heat_entry_id,
        'reporter_name', reporter_registration.display_name, 'category', competition_case.category,
        'priority', competition_case.priority, 'summary', competition_case.summary,
        'private_details', competition_case.private_details, 'evidence_url', competition_case.evidence_url,
        'status', competition_case.status, 'resolution_note', competition_case.resolution_note,
        'round_name', heat.round_name, 'heat_number', heat.heat_number,
        'review_hold', heat.review_hold, 'created_at', competition_case.created_at
      ) order by case when competition_case.priority = 'Urgent' then 0 else 1 end, competition_case.created_at)
      from public.talent7_competition_cases competition_case
      left join public.talent7_competition_registrations reporter_registration
        on reporter_registration.campaign_id = competition_case.campaign_id
       and reporter_registration.user_id = competition_case.reporter_user_id
      left join public.talent7_competition_heats heat on heat.id = competition_case.heat_id
      where competition_case.campaign_id = target_campaign_id
    ), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'heat_id', heat.id, 'cohort_number', heat.cohort_number, 'round_name', heat.round_name,
        'heat_number', heat.heat_number, 'reason', heat.review_hold_reason, 'held_at', heat.review_hold_at
      ) order by heat.scheduled_start)
      from public.talent7_competition_heats heat
      where heat.campaign_id = target_campaign_id and heat.review_hold
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.review_talent7_competition_case(
  target_case_id uuid,
  target_status text,
  target_resolution_note text default null,
  target_hold_action text default 'No change'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_case public.talent7_competition_cases;
begin
  if acting_user is null or not exists (select 1 from public.app_admins where app_admins.user_id = acting_user) then raise exception 'Talent7 organizer access required'; end if;
  if target_status not in ('Acknowledged', 'Investigating', 'Resolved', 'Dismissed') then raise exception 'Choose a valid case status'; end if;
  if target_hold_action not in ('No change', 'Place hold', 'Release hold') then raise exception 'Choose a valid review-hold action'; end if;
  if char_length(coalesce(target_resolution_note, '')) > 1000 then raise exception 'Keep the resolution note under 1000 characters'; end if;
  if target_status in ('Resolved', 'Dismissed') and char_length(btrim(coalesce(target_resolution_note, ''))) < 10 then raise exception 'A closed case needs a clear resolution note'; end if;
  select * into target_case from public.talent7_competition_cases where id = target_case_id for update;
  if target_case.id is null then raise exception 'Competition case not found'; end if;

  update public.talent7_competition_cases
  set status = target_status,
      resolution_note = nullif(btrim(target_resolution_note), ''),
      reviewed_by = acting_user,
      reviewed_at = now(),
      resolved_at = case when target_status in ('Resolved', 'Dismissed') then now() else null end,
      sensitive_delete_after = case when target_status in ('Resolved', 'Dismissed') then now() + interval '180 days' else null end,
      updated_at = now()
  where id = target_case.id;

  if target_case.heat_id is not null and target_hold_action = 'Place hold' then
    update public.talent7_competition_heats
    set review_hold = true,
        review_hold_reason = coalesce(nullif(btrim(target_resolution_note), ''), target_case.summary),
        review_hold_by = acting_user, review_hold_at = now(), updated_at = now()
    where id = target_case.heat_id;
  elsif target_case.heat_id is not null and target_hold_action = 'Release hold' then
    if exists (
      select 1 from public.talent7_competition_cases other_case
      where other_case.heat_id = target_case.heat_id and other_case.id <> target_case.id
        and other_case.status in ('Submitted', 'Acknowledged', 'Investigating')
    ) then raise exception 'Another open case still requires this heat to remain under review'; end if;
    update public.talent7_competition_heats
    set review_hold = false, review_hold_reason = null, review_hold_by = null, review_hold_at = null, updated_at = now()
    where id = target_case.heat_id;
  end if;

  perform public.enqueue_push_notification(
    target_case.reporter_user_id, acting_user, 'Proof and result', 'Competition case updated',
    target_case.case_number || ' is now ' || target_status || '. Open your private review center for details.',
    '#community-competition', 'competition_heat', target_case.id
  );
  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_case.campaign_id, acting_user, 'Competition case reviewed', jsonb_build_object(
    'case_id', target_case.id, 'status', target_status, 'hold_action', target_hold_action
  ));
end;
$$;

create or replace function public.get_public_talent7_competition_review_holds(target_campaign_id uuid)
returns table (heat_id uuid, cohort_number integer, round_name text, heat_number integer, public_status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select heat.id, heat.cohort_number, heat.round_name, heat.heat_number, 'Result under review'::text
  from public.talent7_competition_heats heat
  where heat.campaign_id = target_campaign_id and heat.review_hold
  order by heat.scheduled_start;
$$;

create or replace function public.guard_talent7_advancement_review_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.advanced_from_entry_id is not null and exists (
    select 1 from public.talent7_competition_heat_entries source_entry
    join public.talent7_competition_heats source_heat on source_heat.id = source_entry.heat_id
    where source_entry.id = new.advanced_from_entry_id and source_heat.review_hold
  ) then raise exception 'Advancement is paused while the source result is under review'; end if;
  return new;
end;
$$;

create or replace function public.guard_talent7_champion_review_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = new.campaign_id and heat.cohort_number = new.cohort_number
      and heat.round_name = 'Final' and heat.review_hold
  ) then raise exception 'Champion verification is paused while the final is under review'; end if;
  return new;
end;
$$;

create or replace function public.guard_talent7_certificate_review_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    where entry.id = new.source_entry_id and heat.review_hold
  ) then raise exception 'Certificate issuance is paused while this result is under review'; end if;
  return new;
end;
$$;

create or replace function public.guard_talent7_prize_claim_review_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    where entry.id = new.eligible_entry_id and heat.review_hold
  ) then raise exception 'Prize fulfilment is paused while this result is under review'; end if;
  return new;
end;
$$;

drop trigger if exists guard_talent7_heat_entry_review_hold on public.talent7_competition_heat_entries;
create trigger guard_talent7_heat_entry_review_hold before insert on public.talent7_competition_heat_entries
for each row execute function public.guard_talent7_advancement_review_hold();
drop trigger if exists guard_talent7_champion_review_hold on public.talent7_competition_champions;
create trigger guard_talent7_champion_review_hold before insert or update on public.talent7_competition_champions
for each row execute function public.guard_talent7_champion_review_hold();
drop trigger if exists guard_talent7_certificate_review_hold on public.talent7_competition_certificates;
create trigger guard_talent7_certificate_review_hold before insert on public.talent7_competition_certificates
for each row execute function public.guard_talent7_certificate_review_hold();
drop trigger if exists guard_talent7_prize_claim_review_hold on public.talent7_competition_prize_claims;
create trigger guard_talent7_prize_claim_review_hold before insert or update on public.talent7_competition_prize_claims
for each row execute function public.guard_talent7_prize_claim_review_hold();

create or replace function public.purge_talent7_competition_case_sensitive_data()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare purged integer;
begin
  update public.talent7_competition_cases
  set private_details = '[Sensitive case details removed after retention period]',
      evidence_url = null, sensitive_deleted_at = now(), updated_at = now()
  where sensitive_deleted_at is null and sensitive_delete_after is not null and sensitive_delete_after <= now();
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function public.get_my_talent7_competition_case_state(uuid) from public;
revoke all on function public.stamp_talent7_competition_heat_finalized_at() from public;
revoke all on function public.submit_talent7_competition_case(uuid, text, text, text, uuid, text) from public;
revoke all on function public.withdraw_my_talent7_competition_case(uuid) from public;
revoke all on function public.get_talent7_competition_case_admin_state(uuid) from public;
revoke all on function public.review_talent7_competition_case(uuid, text, text, text) from public;
revoke all on function public.get_public_talent7_competition_review_holds(uuid) from public;
revoke all on function public.guard_talent7_advancement_review_hold() from public;
revoke all on function public.guard_talent7_champion_review_hold() from public;
revoke all on function public.guard_talent7_certificate_review_hold() from public;
revoke all on function public.guard_talent7_prize_claim_review_hold() from public;
revoke all on function public.purge_talent7_competition_case_sensitive_data() from public;

grant execute on function public.get_my_talent7_competition_case_state(uuid) to authenticated;
grant execute on function public.submit_talent7_competition_case(uuid, text, text, text, uuid, text) to authenticated;
grant execute on function public.withdraw_my_talent7_competition_case(uuid) to authenticated;
grant execute on function public.get_talent7_competition_case_admin_state(uuid) to authenticated;
grant execute on function public.review_talent7_competition_case(uuid, text, text, text) to authenticated;
grant execute on function public.get_public_talent7_competition_review_holds(uuid) to anon, authenticated;

do $setup_case_cleanup_cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'talent7-competition-case-sensitive-cleanup') then
      perform cron.schedule('talent7-competition-case-sensitive-cleanup', '35 3 * * *', 'select public.purge_talent7_competition_case_sensitive_data();');
    end if;
  end if;
end;
$setup_case_cleanup_cron$;

comment on table public.talent7_competition_cases is
  'Private participant appeals and incident reports. Public views expose only that a result is under review, never the allegation or reporter.';

commit;
