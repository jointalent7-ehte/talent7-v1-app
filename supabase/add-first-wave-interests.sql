create extension if not exists "uuid-ossp";

create table if not exists public.first_wave_interests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  main_interest text not null,
  region text not null,
  role_goal text not null check (role_goal in ('Challenger', 'Audience', 'Coach', 'Organizer', 'Expert helper', 'Gaming squad')),
  availability text not null check (availability in ('Ready now', 'This week', 'This month', 'Just exploring')),
  notes text,
  status text not null default 'New' check (status in ('New', 'Contact later', 'Invited', 'Active tester')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists first_wave_interests_user_id_key
on public.first_wave_interests (user_id);

alter table public.first_wave_interests enable row level security;

drop policy if exists "Users can create own first wave interest" on public.first_wave_interests;
drop policy if exists "Users can read own first wave interest" on public.first_wave_interests;
drop policy if exists "Users can update own first wave interest" on public.first_wave_interests;
drop policy if exists "Owners can read all first wave interests" on public.first_wave_interests;
drop policy if exists "Owners can update first wave interests" on public.first_wave_interests;

create policy "Users can create own first wave interest"
on public.first_wave_interests for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can read own first wave interest"
on public.first_wave_interests for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can update own first wave interest"
on public.first_wave_interests for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Owners can read all first wave interests"
on public.first_wave_interests for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update first wave interests"
on public.first_wave_interests for update
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
