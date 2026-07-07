create extension if not exists "uuid-ossp";

create table if not exists public.showcase_posts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null default 'Video' check (media_type in ('Photo', 'Video', 'Link')),
  media_url text not null,
  caption text not null,
  category text not null default 'Talent',
  created_at timestamptz not null default now()
);

alter table public.showcase_posts enable row level security;

drop policy if exists "Public can read showcase posts" on public.showcase_posts;
drop policy if exists "Signed in users can create showcase posts" on public.showcase_posts;

create policy "Public can read showcase posts"
on public.showcase_posts for select
using (true);

create policy "Signed in users can create showcase posts"
on public.showcase_posts for insert
to authenticated
with check (auth.uid() = user_id);
