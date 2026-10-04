-- Talent7 privacy-safe community competition invitation attribution.
-- Run after add-community-competition-participant-entry-pass.sql.

begin;

alter table public.talent7_competition_registrations
  add column if not exists invite_code text,
  add column if not exists referred_by_registration_id uuid,
  add column if not exists referral_claimed_at timestamptz;

alter table public.talent7_competition_registrations
  drop constraint if exists talent7_competition_registrations_referred_by_registration_id_fkey;
alter table public.talent7_competition_registrations
  add constraint talent7_competition_registrations_referred_by_registration_id_fkey
  foreign key (referred_by_registration_id)
  references public.talent7_competition_registrations(id)
  on delete set null;

do $backfill_competition_invite_codes$
declare
  registration record;
  next_code text;
begin
  for registration in
    select id from public.talent7_competition_registrations where invite_code is null
  loop
    loop
      next_code := 'JOIN-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 9));
      exit when not exists (
        select 1 from public.talent7_competition_registrations where invite_code = next_code
      );
    end loop;
    update public.talent7_competition_registrations set invite_code = next_code where id = registration.id;
  end loop;
end;
$backfill_competition_invite_codes$;

alter table public.talent7_competition_registrations
  alter column invite_code set not null;

create unique index if not exists talent7_competition_registrations_invite_code_idx
on public.talent7_competition_registrations (invite_code);

alter table public.talent7_competition_registrations
  drop constraint if exists talent7_competition_registrations_not_self_referred_check;
alter table public.talent7_competition_registrations
  add constraint talent7_competition_registrations_not_self_referred_check
  check (referred_by_registration_id is null or referred_by_registration_id <> id);

create or replace function public.ensure_talent7_competition_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.invite_code is null or btrim(new.invite_code) = '' then
    loop
      new.invite_code := 'JOIN-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 9));
      exit when not exists (
        select 1 from public.talent7_competition_registrations registration
        where registration.invite_code = new.invite_code
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_talent7_competition_invite_code on public.talent7_competition_registrations;
create trigger ensure_talent7_competition_invite_code
before insert on public.talent7_competition_registrations
for each row execute function public.ensure_talent7_competition_invite_code();

create or replace function public.claim_talent7_competition_referral(
  target_campaign_id uuid,
  target_invite_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  own_registration public.talent7_competition_registrations;
  inviter_registration public.talent7_competition_registrations;
begin
  if acting_user is null then raise exception 'Log in to connect the invitation'; end if;
  select * into own_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user
  for update;
  if own_registration.id is null or own_registration.status = 'Withdrawn' then
    raise exception 'Register for this competition before connecting an invitation';
  end if;
  if own_registration.referred_by_registration_id is not null then return true; end if;

  select * into inviter_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id
    and registration.invite_code = upper(btrim(coalesce(target_invite_code, '')))
    and registration.status <> 'Withdrawn';
  if inviter_registration.id is null then raise exception 'This competition invitation is not active'; end if;
  if inviter_registration.id = own_registration.id or inviter_registration.user_id = acting_user then
    raise exception 'Your own invitation cannot be applied to your registration';
  end if;

  update public.talent7_competition_registrations
  set referred_by_registration_id = inviter_registration.id,
      referral_claimed_at = now(), updated_at = now()
  where id = own_registration.id and referred_by_registration_id is null;
  return true;
end;
$$;

create or replace function public.get_my_talent7_competition_invite_state(target_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  own_registration public.talent7_competition_registrations;
begin
  if acting_user is null then raise exception 'Log in to view your competition invitation'; end if;
  select * into own_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id and registration.user_id = acting_user
    and registration.status <> 'Withdrawn';
  if own_registration.id is null then
    return jsonb_build_object('registered', false, 'invite_code', null, 'registration_count', 0, 'confirmed_count', 0, 'referred', false);
  end if;

  return jsonb_build_object(
    'registered', true,
    'invite_code', own_registration.invite_code,
    'registration_count', (
      select count(*) from public.talent7_competition_registrations referral
      where referral.referred_by_registration_id = own_registration.id and referral.status <> 'Withdrawn'
    ),
    'confirmed_count', (
      select count(*) from public.talent7_competition_registrations referral
      where referral.referred_by_registration_id = own_registration.id
        and referral.status in ('Confirmed', 'Completed')
    ),
    'referred', own_registration.referred_by_registration_id is not null
  );
end;
$$;

create or replace function public.get_talent7_competition_invite_admin_state(target_campaign_id uuid)
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
    'attributed_registrations', (
      select count(*) from public.talent7_competition_registrations registration
      where registration.campaign_id = target_campaign_id
        and registration.referred_by_registration_id is not null
        and registration.status <> 'Withdrawn'
    ),
    'attributed_confirmed', (
      select count(*) from public.talent7_competition_registrations registration
      where registration.campaign_id = target_campaign_id
        and registration.referred_by_registration_id is not null
        and registration.status in ('Confirmed', 'Completed')
    ),
    'top_inviters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'registration_id', ranked.registration_id,
        'display_name', ranked.display_name,
        'public_anonymous', ranked.public_anonymous,
        'invite_code', ranked.invite_code,
        'registration_count', ranked.registration_count,
        'confirmed_count', ranked.confirmed_count
      ) order by ranked.registration_count desc, ranked.confirmed_count desc, ranked.display_name)
      from (
        select inviter.id as registration_id, inviter.display_name, inviter.public_anonymous,
          inviter.invite_code, count(referral.id)::integer as registration_count,
          count(referral.id) filter (where referral.status in ('Confirmed', 'Completed'))::integer as confirmed_count
        from public.talent7_competition_registrations inviter
        join public.talent7_competition_registrations referral
          on referral.referred_by_registration_id = inviter.id and referral.status <> 'Withdrawn'
        where inviter.campaign_id = target_campaign_id and inviter.status <> 'Withdrawn'
        group by inviter.id
        order by registration_count desc, confirmed_count desc, inviter.display_name
        limit 20
      ) ranked
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ensure_talent7_competition_invite_code() from public;
revoke all on function public.claim_talent7_competition_referral(uuid, text) from public;
revoke all on function public.get_my_talent7_competition_invite_state(uuid) from public;
revoke all on function public.get_talent7_competition_invite_admin_state(uuid) from public;

grant execute on function public.claim_talent7_competition_referral(uuid, text) to authenticated;
grant execute on function public.get_my_talent7_competition_invite_state(uuid) to authenticated;
grant execute on function public.get_talent7_competition_invite_admin_state(uuid) to authenticated;

comment on column public.talent7_competition_registrations.invite_code is
  'Share-safe competition invitation code. It is separate from the private registration code.';
comment on column public.talent7_competition_registrations.referred_by_registration_id is
  'One-time registration attribution only; it never changes ranking, entry priority, prizes, or rewards.';

commit;
