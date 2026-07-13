create extension if not exists "uuid-ossp";

create table if not exists public.payment_interests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  intent_type text not null check (intent_type in ('Plan', 'Contribution')),
  label text not null,
  amount_label text not null,
  status text not null default 'Interested' check (status in ('Interested', 'Ready later', 'Contact requested')),
  created_at timestamptz not null default now()
);

alter table public.payment_interests enable row level security;

drop policy if exists "Users can create own payment interests" on public.payment_interests;
drop policy if exists "Users can read own payment interests" on public.payment_interests;

create policy "Users can create own payment interests"
on public.payment_interests for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can read own payment interests"
on public.payment_interests for select
to authenticated
using (auth.uid() = user_id);
