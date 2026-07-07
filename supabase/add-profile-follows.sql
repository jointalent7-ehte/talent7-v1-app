create extension if not exists "uuid-ossp";

create table if not exists public.profile_follows (
  id uuid primary key default uuid_generate_v4(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_follows_not_self check (follower_id <> following_id)
);

create unique index if not exists profile_follows_unique_pair
on public.profile_follows (follower_id, following_id);

alter table public.profile_follows enable row level security;

drop policy if exists "Users can read profile follows" on public.profile_follows;
drop policy if exists "Users can follow profiles" on public.profile_follows;
drop policy if exists "Users can unfollow profiles" on public.profile_follows;

create policy "Users can read profile follows"
on public.profile_follows for select
to authenticated
using (true);

create policy "Users can follow profiles"
on public.profile_follows for insert
to authenticated
with check (auth.uid() = follower_id);

create policy "Users can unfollow profiles"
on public.profile_follows for delete
to authenticated
using (auth.uid() = follower_id);
