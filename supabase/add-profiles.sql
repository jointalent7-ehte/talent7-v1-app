create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  username text not null unique,
  role text not null default 'Challenger',
  main_interest text not null default 'Badminton doubles',
  region text not null default 'Global',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by signed in users" on public.profiles;
drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Profiles are readable by signed in users"
on public.profiles for select
to authenticated
using (true);

create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
