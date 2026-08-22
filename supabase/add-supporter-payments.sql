-- One-time supporter purchases and public badges.
-- Run after add-growth-engagement.sql. Existing payment rows and interest research remain preserved.

alter table public.payments
  add column if not exists provider_product_id text,
  add column if not exists provider_purchase_token_hash text;

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('Creating', 'Created', 'Pending', 'Authorized', 'Captured', 'Failed', 'Cancelled', 'Refunded'));

create unique index if not exists payments_provider_purchase_token_hash_unique
  on public.payments (provider, provider_purchase_token_hash)
  where provider_purchase_token_hash is not null;

create index if not exists payments_provider_product_idx
  on public.payments (provider, provider_product_id, created_at desc);

create table if not exists public.supporter_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null check (tier in ('Supporter', 'Champion Supporter', 'Founder Supporter')),
  source_payment_id uuid references public.payments(id) on delete set null,
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supporter_entitlements enable row level security;

drop policy if exists "Public can read active supporter badges" on public.supporter_entitlements;

create policy "Public can read active supporter badges"
on public.supporter_entitlements for select
to anon, authenticated
using (active = true);

create or replace function public.reconcile_supporter_entitlement(target_user_id uuid)
returns public.supporter_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  winning_payment public.payments%rowtype;
  resolved_tier text;
  result public.supporter_entitlements%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the payment service can reconcile supporter entitlements.';
  end if;

  select payments.*
  into winning_payment
  from public.payments
  where payments.user_id = target_user_id
    and payments.status = 'Captured'
    and payments.product_code in (
      'supporter_99',
      'champion_supporter_299',
      'founder_supporter_999',
      'custom_support'
    )
    and (
      payments.product_code <> 'custom_support'
      or payments.currency = 'INR' and payments.amount_subunits >= 9900
    )
  order by
    case
      when payments.product_code = 'founder_supporter_999' then 3
      when payments.product_code = 'champion_supporter_299' then 2
      when payments.product_code = 'supporter_99' then 1
      when payments.product_code = 'custom_support' and payments.amount_subunits >= 99900 then 3
      when payments.product_code = 'custom_support' and payments.amount_subunits >= 29900 then 2
      else 1
    end desc,
    payments.captured_at desc nulls last,
    payments.created_at desc
  limit 1;

  if winning_payment.id is null then
    delete from public.supporter_entitlements
    where supporter_entitlements.user_id = target_user_id;
    return null;
  end if;

  resolved_tier := case
    when winning_payment.product_code = 'founder_supporter_999' then 'Founder Supporter'
    when winning_payment.product_code = 'champion_supporter_299' then 'Champion Supporter'
    when winning_payment.product_code = 'supporter_99' then 'Supporter'
    when winning_payment.amount_subunits >= 99900 then 'Founder Supporter'
    when winning_payment.amount_subunits >= 29900 then 'Champion Supporter'
    else 'Supporter'
  end;

  insert into public.supporter_entitlements as entitlements (
    user_id,
    tier,
    source_payment_id,
    active,
    granted_at,
    updated_at
  ) values (
    target_user_id,
    resolved_tier,
    winning_payment.id,
    true,
    coalesce(winning_payment.captured_at, now()),
    now()
  )
  on conflict (user_id) do update
  set tier = excluded.tier,
      source_payment_id = excluded.source_payment_id,
      active = true,
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.reconcile_supporter_entitlement_for_payment(target_payment_id uuid)
returns public.supporter_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the payment service can reconcile supporter entitlements.';
  end if;

  select payments.user_id into target_user_id
  from public.payments
  where payments.id = target_payment_id;

  if target_user_id is null then
    raise exception 'Payment does not belong to an active Talent7 account.';
  end if;

  return public.reconcile_supporter_entitlement(target_user_id);
end;
$$;

revoke all on function public.reconcile_supporter_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_supporter_entitlement_for_payment(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_supporter_entitlement(uuid) to service_role;
grant execute on function public.reconcile_supporter_entitlement_for_payment(uuid) to service_role;

comment on table public.supporter_entitlements is
  'Highest active one-time Talent7 supporter tier, derived only from server-verified captured payments.';

create or replace function public.get_public_supporter_badge(target_share_token uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select entitlement.tier
  from public.profiles profile
  join public.supporter_entitlements entitlement
    on entitlement.user_id = profile.user_id
   and entitlement.active = true
  where profile.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_public_supporter_badge(uuid) from public;
grant execute on function public.get_public_supporter_badge(uuid) to anon, authenticated;
