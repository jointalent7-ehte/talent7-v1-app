-- Talent7 versioned participant entry pass and database-enforced check-in consent.
-- Run after add-community-competition-standby-replacements.sql.

begin;

create table if not exists public.talent7_competition_participant_requirements (
  campaign_id uuid primary key references public.talent7_competition_campaigns(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  rules_summary text not null check (char_length(rules_summary) between 40 and 2000),
  safety_notice text not null check (char_length(safety_notice) between 40 and 1200),
  recording_notice text not null check (char_length(recording_notice) between 40 and 1200),
  conduct_notice text not null check (char_length(conduct_notice) between 40 and 1200),
  eligibility_notice text not null check (char_length(eligibility_notice) between 40 and 1200),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent7_competition_participant_agreements (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  registration_id uuid not null references public.talent7_competition_registrations(id) on delete cascade,
  requirement_version integer not null check (requirement_version > 0),
  rules_acknowledged boolean not null,
  safety_acknowledged boolean not null,
  recording_acknowledged boolean not null,
  conduct_acknowledged boolean not null,
  eligibility_acknowledged boolean not null,
  accepted_at timestamptz not null default now(),
  unique (registration_id, requirement_version),
  check (
    rules_acknowledged and safety_acknowledged and recording_acknowledged
    and conduct_acknowledged and eligibility_acknowledged
  )
);

create index if not exists talent7_competition_participant_agreements_campaign_idx
on public.talent7_competition_participant_agreements (campaign_id, requirement_version, accepted_at);

alter table public.talent7_competition_participant_requirements enable row level security;
alter table public.talent7_competition_participant_agreements enable row level security;
revoke all on public.talent7_competition_participant_requirements from anon, authenticated;
revoke all on public.talent7_competition_participant_agreements from anon, authenticated;

insert into public.talent7_competition_participant_requirements (
  campaign_id, rules_summary, safety_notice, recording_notice, conduct_notice, eligibility_notice
)
select
  campaign.id,
  'Use one account and one camera. Keep the required movement and full judging area visible. Begin and finish only on the official clock, follow the published form standard, and accept the organizer''s reviewed result process.',
  'Choose a clear, suitable space and participate only if you can do so safely. Stop immediately if you feel pain, dizziness, breathing difficulty, or any unsafe condition. Talent7 instructions are event rules, not medical advice.',
  'Your live camera and submitted proof may be viewed by authorized organizers for scoring, safety, disputes, and the published review period. Footage is not made public or reused as a highlight without a separate sharing choice.',
  'Compete honestly and respectfully. Harassment, impersonation, hidden assistance, manipulated footage, unsafe behavior, or attempts to interfere with another participant can lead to removal and review.',
  'You confirm that you meet the event''s published age, location, prize, and participation requirements. Where local rules require guardian permission, you confirm that permission has been obtained before competing.'
from public.talent7_competition_campaigns campaign
on conflict (campaign_id) do nothing;

create or replace function public.create_default_talent7_competition_participant_requirements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.talent7_competition_participant_requirements (
    campaign_id, rules_summary, safety_notice, recording_notice, conduct_notice, eligibility_notice
  ) values (
    new.id,
    'Use one account and one camera. Keep the required movement and full judging area visible. Begin and finish only on the official clock, follow the published form standard, and accept the organizer''s reviewed result process.',
    'Choose a clear, suitable space and participate only if you can do so safely. Stop immediately if you feel pain, dizziness, breathing difficulty, or any unsafe condition. Talent7 instructions are event rules, not medical advice.',
    'Your live camera and submitted proof may be viewed by authorized organizers for scoring, safety, disputes, and the published review period. Footage is not made public or reused as a highlight without a separate sharing choice.',
    'Compete honestly and respectfully. Harassment, impersonation, hidden assistance, manipulated footage, unsafe behavior, or attempts to interfere with another participant can lead to removal and review.',
    'You confirm that you meet the event''s published age, location, prize, and participation requirements. Where local rules require guardian permission, you confirm that permission has been obtained before competing.'
  ) on conflict (campaign_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_talent7_competition_participant_requirements on public.talent7_competition_campaigns;
create trigger create_default_talent7_competition_participant_requirements
after insert on public.talent7_competition_campaigns
for each row execute function public.create_default_talent7_competition_participant_requirements();

create or replace function public.get_public_talent7_competition_participant_requirements(target_campaign_id uuid)
returns table (
  version integer,
  rules_summary text,
  safety_notice text,
  recording_notice text,
  conduct_notice text,
  eligibility_notice text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select requirement.version, requirement.rules_summary, requirement.safety_notice,
    requirement.recording_notice, requirement.conduct_notice, requirement.eligibility_notice,
    requirement.updated_at
  from public.talent7_competition_participant_requirements requirement
  join public.talent7_competition_campaigns campaign on campaign.id = requirement.campaign_id
  where requirement.campaign_id = target_campaign_id
    and (
      campaign.phase <> 'Draft'
      or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
    );
$$;

create or replace function public.get_my_talent7_competition_participant_pass(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_registration public.talent7_competition_registrations;
  requirement public.talent7_competition_participant_requirements;
begin
  if acting_user is null then raise exception 'Log in to view your participant entry pass'; end if;
  select * into target_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user;
  select * into requirement
  from public.talent7_competition_participant_requirements
  where campaign_id = target_campaign_id;

  return jsonb_build_object(
    'registered', target_registration.id is not null,
    'registration_status', target_registration.status,
    'requirement_version', requirement.version,
    'accepted', target_registration.id is not null and exists (
      select 1 from public.talent7_competition_participant_agreements agreement
      where agreement.registration_id = target_registration.id
        and agreement.requirement_version = requirement.version
    ),
    'accepted_at', (
      select agreement.accepted_at
      from public.talent7_competition_participant_agreements agreement
      where agreement.registration_id = target_registration.id
        and agreement.requirement_version = requirement.version
      limit 1
    )
  );
end;
$$;

create or replace function public.accept_talent7_competition_participant_pass(
  target_campaign_id uuid,
  target_requirement_version integer,
  target_rules_acknowledged boolean,
  target_safety_acknowledged boolean,
  target_recording_acknowledged boolean,
  target_conduct_acknowledged boolean,
  target_eligibility_acknowledged boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_registration public.talent7_competition_registrations;
  requirement public.talent7_competition_participant_requirements;
  saved_at timestamptz;
begin
  if acting_user is null then raise exception 'Log in to accept the participant entry pass'; end if;
  select * into target_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user;
  if target_registration.id is null or target_registration.status not in ('Interested', 'Confirmed') then
    raise exception 'An active competition registration is required';
  end if;
  select * into requirement
  from public.talent7_competition_participant_requirements
  where campaign_id = target_campaign_id;
  if requirement.version is null or requirement.version <> target_requirement_version then
    raise exception 'The event requirements changed. Review the latest version before accepting';
  end if;
  if not (
    coalesce(target_rules_acknowledged, false)
    and coalesce(target_safety_acknowledged, false)
    and coalesce(target_recording_acknowledged, false)
    and coalesce(target_conduct_acknowledged, false)
    and coalesce(target_eligibility_acknowledged, false)
  ) then raise exception 'Acknowledge every entry-pass item before continuing'; end if;

  insert into public.talent7_competition_participant_agreements (
    campaign_id, registration_id, requirement_version, rules_acknowledged,
    safety_acknowledged, recording_acknowledged, conduct_acknowledged,
    eligibility_acknowledged
  ) values (
    target_campaign_id, target_registration.id, requirement.version, true, true, true, true, true
  )
  on conflict (registration_id, requirement_version) do update set
    rules_acknowledged = true, safety_acknowledged = true,
    recording_acknowledged = true, conduct_acknowledged = true,
    eligibility_acknowledged = true
  returning accepted_at into saved_at;
  return saved_at;
end;
$$;

create or replace function public.publish_talent7_competition_participant_requirements(
  target_campaign_id uuid,
  target_rules_summary text,
  target_safety_notice text,
  target_recording_notice text,
  target_conduct_notice text,
  target_eligibility_notice text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_version integer;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if exists (
    select 1 from public.talent7_competition_heats heat
    where heat.campaign_id = target_campaign_id and heat.status not in ('Draft', 'Cancelled')
  ) then raise exception 'Requirements cannot change after check-in has opened'; end if;
  if char_length(btrim(coalesce(target_rules_summary, ''))) not between 40 and 2000
    or char_length(btrim(coalesce(target_safety_notice, ''))) not between 40 and 1200
    or char_length(btrim(coalesce(target_recording_notice, ''))) not between 40 and 1200
    or char_length(btrim(coalesce(target_conduct_notice, ''))) not between 40 and 1200
    or char_length(btrim(coalesce(target_eligibility_notice, ''))) not between 40 and 1200
  then raise exception 'Every published requirement needs clear text within the allowed length'; end if;

  insert into public.talent7_competition_participant_requirements (
    campaign_id, rules_summary, safety_notice, recording_notice, conduct_notice,
    eligibility_notice, updated_by
  ) values (
    target_campaign_id, btrim(target_rules_summary), btrim(target_safety_notice),
    btrim(target_recording_notice), btrim(target_conduct_notice),
    btrim(target_eligibility_notice), acting_user
  )
  on conflict (campaign_id) do update set
    version = public.talent7_competition_participant_requirements.version + 1,
    rules_summary = excluded.rules_summary,
    safety_notice = excluded.safety_notice,
    recording_notice = excluded.recording_notice,
    conduct_notice = excluded.conduct_notice,
    eligibility_notice = excluded.eligibility_notice,
    updated_by = acting_user,
    updated_at = now()
  returning version into saved_version;

  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_campaign_id, acting_user, 'Participant requirements published', jsonb_build_object(
    'version', saved_version
  ));
  return saved_version;
end;
$$;

create or replace function public.guard_talent7_competition_check_in_pass()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_campaign_id uuid;
  current_version integer;
begin
  if new.check_in_status = 'Checked in' and old.check_in_status is distinct from 'Checked in' then
    select heat.campaign_id into target_campaign_id
    from public.talent7_competition_heats heat where heat.id = new.heat_id;
    select requirement.version into current_version
    from public.talent7_competition_participant_requirements requirement
    where requirement.campaign_id = target_campaign_id;
    if current_version is not null and not exists (
      select 1 from public.talent7_competition_participant_agreements agreement
      where agreement.registration_id = new.registration_id
        and agreement.campaign_id = target_campaign_id
        and agreement.requirement_version = current_version
    ) then raise exception 'Participant must accept the current event entry pass before check-in'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_talent7_competition_check_in_pass on public.talent7_competition_heat_entries;
create trigger guard_talent7_competition_check_in_pass
before update of check_in_status on public.talent7_competition_heat_entries
for each row execute function public.guard_talent7_competition_check_in_pass();

revoke all on function public.get_public_talent7_competition_participant_requirements(uuid) from public;
revoke all on function public.create_default_talent7_competition_participant_requirements() from public;
revoke all on function public.get_my_talent7_competition_participant_pass(uuid) from public;
revoke all on function public.accept_talent7_competition_participant_pass(uuid, integer, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.publish_talent7_competition_participant_requirements(uuid, text, text, text, text, text) from public;
revoke all on function public.guard_talent7_competition_check_in_pass() from public;

grant execute on function public.get_public_talent7_competition_participant_requirements(uuid) to anon, authenticated;
grant execute on function public.get_my_talent7_competition_participant_pass(uuid) to authenticated;
grant execute on function public.accept_talent7_competition_participant_pass(uuid, integer, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.publish_talent7_competition_participant_requirements(uuid, text, text, text, text, text) to authenticated;

comment on table public.talent7_competition_participant_requirements is
  'Public, versioned event rules and acknowledgements. Medical information is never requested.';
comment on table public.talent7_competition_participant_agreements is
  'Immutable version acceptance required by a database trigger before heat check-in.';

commit;
