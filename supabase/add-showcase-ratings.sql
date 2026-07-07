create extension if not exists "uuid-ossp";

create table if not exists public.showcase_ratings (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.showcase_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 7),
  created_at timestamptz not null default now()
);

create unique index if not exists showcase_ratings_one_per_user
on public.showcase_ratings (post_id, user_id);

alter table public.showcase_ratings enable row level security;

drop policy if exists "Public can read showcase ratings" on public.showcase_ratings;
drop policy if exists "Signed in users can rate showcase posts" on public.showcase_ratings;

create policy "Public can read showcase ratings"
on public.showcase_ratings for select
using (true);

create policy "Signed in users can rate showcase posts"
on public.showcase_ratings for insert
to authenticated
with check (auth.uid() = user_id);
