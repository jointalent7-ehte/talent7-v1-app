create extension if not exists "uuid-ossp";

create table if not exists public.expert_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  expertise_area text not null check (
    expertise_area in (
      'Medical guidance',
      'Plumbing',
      'Electrical',
      'Tech help',
      'Fitness injury',
      'Other urgent help'
    )
  ),
  region text not null,
  availability text not null,
  live_video_ready boolean not null default false,
  bio text not null,
  verification_status text not null default 'Pending review' check (
    verification_status in ('Pending review', 'Verified', 'Needs changes')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, expertise_area)
);

alter table public.expert_profiles enable row level security;

drop policy if exists "Public can read verified expert profiles" on public.expert_profiles;
drop policy if exists "Users can read own expert profiles" on public.expert_profiles;
drop policy if exists "Users can create own expert profiles" on public.expert_profiles;
drop policy if exists "Users can update own expert profiles" on public.expert_profiles;
drop policy if exists "Owners can read all expert profiles" on public.expert_profiles;
drop policy if exists "Owners can update expert profiles" on public.expert_profiles;

create policy "Public can read verified expert profiles"
on public.expert_profiles for select
using (verification_status = 'Verified');

create policy "Users can read own expert profiles"
on public.expert_profiles for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own expert profiles"
on public.expert_profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own expert profiles"
on public.expert_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and verification_status in ('Pending review', 'Needs changes')
);

create policy "Owners can read all expert profiles"
on public.expert_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update expert profiles"
on public.expert_profiles for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);
