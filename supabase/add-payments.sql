-- Provider-neutral payment ledger. Run after add-account-deletion-workflow.sql.
-- Payment rows are created and updated only by trusted server routes.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('Razorpay', 'Google Play')),
  product_code text not null check (char_length(product_code) between 1 and 80),
  product_name text not null check (char_length(product_name) between 1 and 120),
  amount_subunits bigint not null check (amount_subunits > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'Creating'
    check (status in ('Creating', 'Created', 'Authorized', 'Captured', 'Failed', 'Refunded')),
  provider_order_id text unique,
  provider_payment_id text unique,
  failure_code text,
  failure_description text,
  verified_at timestamptz,
  captured_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);

create index if not exists payments_status_created_idx
  on public.payments (status, created_at desc);

alter table public.payments enable row level security;

drop policy if exists "Users can read own payments" on public.payments;
drop policy if exists "Owners can read all payments" on public.payments;

create policy "Users can read own payments"
on public.payments for select
to authenticated
using (user_id = auth.uid());

create policy "Owners can read all payments"
on public.payments for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

-- Webhook delivery IDs prevent repeated provider events from creating repeated work.
-- Payloads are deliberately not stored because they can contain payment/customer data.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('Razorpay', 'Google Play')),
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.payment_webhook_events enable row level security;

comment on table public.payments is
  'Server-controlled payment ledger shared by web payment providers and app-store billing.';

comment on table public.payment_webhook_events is
  'Minimal idempotency ledger for signed provider webhooks; no webhook payloads are retained.';
