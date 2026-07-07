create extension if not exists "uuid-ossp";

create table if not exists public.showcase_comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.showcase_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.showcase_comments enable row level security;

drop policy if exists "Public can read showcase comments" on public.showcase_comments;
drop policy if exists "Signed in users can create showcase comments" on public.showcase_comments;

create policy "Public can read showcase comments"
on public.showcase_comments for select
using (true);

create policy "Signed in users can create showcase comments"
on public.showcase_comments for insert
to authenticated
with check (auth.uid() = user_id);
