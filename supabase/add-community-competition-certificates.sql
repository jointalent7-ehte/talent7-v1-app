-- Talent7 permanent competition certificates and Founding Champion trophies.
-- Run after add-community-competition-round-advancement.sql.

begin;

create table if not exists public.talent7_competition_certificates (
  id uuid primary key default uuid_generate_v4(),
  certificate_number text not null default ('T7-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 12))) unique,
  share_token uuid not null default uuid_generate_v4() unique,
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  cohort_number integer not null check (cohort_number > 0),
  registration_id uuid not null references public.talent7_competition_registrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_entry_id uuid not null references public.talent7_competition_heat_entries(id) on delete restrict,
  recipient_name text not null check (char_length(recipient_name) between 1 and 80),
  competition_title text not null check (char_length(competition_title) between 3 and 120),
  activity_name text not null check (char_length(activity_name) between 2 and 100),
  award_type text not null check (award_type in ('Verified Competitor', 'Finalist', 'Champion', 'Founding Champion')),
  highest_round text not null check (highest_round in ('Qualifier', 'Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final')),
  verified_placement integer check (verified_placement is null or verified_placement > 0),
  verified_score numeric check (verified_score is null or verified_score >= 0),
  sharing_enabled boolean not null default false,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, registration_id)
);

create index if not exists talent7_competition_certificates_user_idx
on public.talent7_competition_certificates (user_id, issued_at desc);

alter table public.talent7_competition_certificates enable row level security;
revoke all on public.talent7_competition_certificates from anon, authenticated;

create or replace function public.issue_talent7_competition_certificates(
  target_campaign_id uuid,
  target_cohort_number integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_campaign public.talent7_competition_campaigns;
  target_activity text;
  champion_registration_id uuid;
  candidate record;
  saved_certificate public.talent7_competition_certificates;
  next_award_type text;
  issued_count integer := 0;
begin
  if acting_user is null or not exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) then raise exception 'Talent7 organizer access required'; end if;
  if target_cohort_number is null or target_cohort_number < 1 then raise exception 'Choose a valid cohort'; end if;

  select * into target_campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id
  for update;
  if target_campaign.id is null then raise exception 'Competition campaign not found'; end if;
  select option.activity into target_activity
  from public.talent7_competition_options option
  where option.id = target_campaign.selected_activity_option_id;
  target_activity := left(coalesce(target_activity, target_campaign.title), 100);

  select champion.registration_id into champion_registration_id
  from public.talent7_competition_champions champion
  where champion.campaign_id = target_campaign_id and champion.cohort_number = target_cohort_number;
  if champion_registration_id is null then
    raise exception 'Verify the cohort champion before issuing certificates';
  end if;

  for candidate in
    select distinct on (registration.id)
      entry.id as entry_id,
      registration.id as registration_id,
      registration.user_id,
      registration.display_name,
      heat.round_name,
      entry.placement,
      entry.final_score
    from public.talent7_competition_heat_entries entry
    join public.talent7_competition_heats heat on heat.id = entry.heat_id
    join public.talent7_competition_registrations registration on registration.id = entry.registration_id
    where heat.campaign_id = target_campaign_id
      and heat.cohort_number = target_cohort_number
      and heat.status = 'Final'
      and entry.result_status = 'Verified'
      and exists (
        select 1 from public.talent7_competition_heat_proofs proof
        where proof.heat_entry_id = entry.id and proof.review_status = 'Accepted'
      )
    order by registration.id,
      case heat.round_name
        when 'Final' then 6 when 'Semifinal' then 5 when 'Quarterfinal' then 4
        when 'Round of 16' then 3 when 'Round of 32' then 2 else 1
      end desc,
      entry.placement nulls last
  loop
    next_award_type := case
      when candidate.registration_id = champion_registration_id and target_campaign.slug = 'founding-community-competition' then 'Founding Champion'
      when candidate.registration_id = champion_registration_id then 'Champion'
      when candidate.round_name = 'Final' then 'Finalist'
      else 'Verified Competitor'
    end;

    insert into public.talent7_competition_certificates (
      campaign_id, cohort_number, registration_id, user_id, source_entry_id,
      recipient_name, competition_title, activity_name, award_type, highest_round,
      verified_placement, verified_score, issued_by
    ) values (
      target_campaign_id, target_cohort_number, candidate.registration_id, candidate.user_id, candidate.entry_id,
      candidate.display_name, target_campaign.title, target_activity, next_award_type, candidate.round_name,
      candidate.placement, candidate.final_score, acting_user
    ) on conflict (campaign_id, registration_id) do nothing
    returning * into saved_certificate;

    if saved_certificate.id is not null then
      issued_count := issued_count + 1;
      perform public.enqueue_push_notification(
        candidate.user_id, acting_user, 'Proof and result', 'Your Talent7 certificate is ready',
        'Your proof-backed ' || target_campaign.title || ' certificate is now available. You control whether its verification link is public.',
        '#community-competition', 'competition_heat', saved_certificate.id
      );
    end if;
    saved_certificate := null;
  end loop;

  insert into public.talent7_trophies (
    user_id, trophy_key, title, detail, rarity, icon_key, source_challenge_id
  )
  select
    registration.user_id,
    'founding-community-champion-' || target_campaign_id::text || '-' || target_cohort_number::text,
    case when target_campaign.slug = 'founding-community-competition' then 'Founding Champion' else 'Community Champion' end,
    'Verified champion of cohort ' || target_cohort_number || ' in ' || target_campaign.title || '.',
    'Legendary', 'victory', null
  from public.talent7_competition_registrations registration
  where registration.id = champion_registration_id
  on conflict do nothing;

  insert into public.talent7_competition_admin_actions (campaign_id, admin_user_id, action, details)
  values (target_campaign_id, acting_user, 'Competition certificates issued', jsonb_build_object(
    'cohort', target_cohort_number, 'issued', issued_count
  ));
  return issued_count;
end;
$$;

create or replace function public.get_my_talent7_competition_certificates(target_campaign_id uuid default null)
returns table (
  id uuid,
  certificate_number text,
  share_token uuid,
  campaign_id uuid,
  cohort_number integer,
  recipient_name text,
  competition_title text,
  activity_name text,
  award_type text,
  highest_round text,
  verified_placement integer,
  verified_score numeric,
  sharing_enabled boolean,
  issued_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    certificate.id,
    certificate.certificate_number,
    certificate.share_token,
    certificate.campaign_id,
    certificate.cohort_number,
    certificate.recipient_name,
    certificate.competition_title,
    certificate.activity_name,
    certificate.award_type,
    certificate.highest_round,
    certificate.verified_placement,
    certificate.verified_score,
    certificate.sharing_enabled,
    certificate.issued_at
  from public.talent7_competition_certificates certificate
  where certificate.user_id = auth.uid()
    and certificate.revoked_at is null
    and (target_campaign_id is null or certificate.campaign_id = target_campaign_id)
  order by certificate.issued_at desc;
$$;

create or replace function public.set_my_talent7_competition_certificate_sharing(
  target_certificate_id uuid,
  target_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Log in to manage certificate sharing'; end if;
  update public.talent7_competition_certificates certificate
  set sharing_enabled = coalesce(target_enabled, false), updated_at = now()
  where certificate.id = target_certificate_id
    and certificate.user_id = auth.uid()
    and certificate.revoked_at is null;
  if not found then raise exception 'Certificate not found'; end if;
  return coalesce(target_enabled, false);
end;
$$;

create or replace function public.get_public_talent7_competition_certificate(target_share_token uuid)
returns table (
  certificate_number text,
  recipient_name text,
  competition_title text,
  activity_name text,
  award_type text,
  highest_round text,
  cohort_number integer,
  verified_placement integer,
  verified_score numeric,
  issued_at timestamptz,
  is_valid boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    certificate.certificate_number,
    certificate.recipient_name,
    certificate.competition_title,
    certificate.activity_name,
    certificate.award_type,
    certificate.highest_round,
    certificate.cohort_number,
    certificate.verified_placement,
    certificate.verified_score,
    certificate.issued_at,
    true
  from public.talent7_competition_certificates certificate
  where certificate.share_token = target_share_token
    and certificate.sharing_enabled
    and certificate.revoked_at is null;
$$;

revoke all on function public.issue_talent7_competition_certificates(uuid, integer) from public;
revoke all on function public.get_my_talent7_competition_certificates(uuid) from public;
revoke all on function public.set_my_talent7_competition_certificate_sharing(uuid, boolean) from public;
revoke all on function public.get_public_talent7_competition_certificate(uuid) from public;

grant execute on function public.issue_talent7_competition_certificates(uuid, integer) to authenticated;
grant execute on function public.get_my_talent7_competition_certificates(uuid) to authenticated;
grant execute on function public.set_my_talent7_competition_certificate_sharing(uuid, boolean) to authenticated;
grant execute on function public.get_public_talent7_competition_certificate(uuid) to anon, authenticated;

comment on table public.talent7_competition_certificates is
  'Permanent proof-backed competition certificates. Public verification is recipient-controlled and off by default.';

commit;
