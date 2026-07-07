create extension if not exists "uuid-ossp";

create table if not exists public.showcase_reports (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references public.showcase_posts(id) on delete cascade,
  comment_id uuid references public.showcase_comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('Post', 'Comment')),
  reason text not null check (reason in ('Spam', 'Fake proof', 'Abuse', 'Wrong category', 'Other')),
  notes text,
  status text not null default 'Open' check (status in ('Open', 'Reviewed', 'Dismissed')),
  created_at timestamptz not null default now()
);

alter table public.showcase_reports enable row level security;

drop policy if exists "Users can create showcase reports" on public.showcase_reports;
drop policy if exists "Users can read own showcase reports" on public.showcase_reports;

create policy "Users can create showcase reports"
on public.showcase_reports for insert
to authenticated
with check (auth.uid() = reporter_id);

create policy "Users can read own showcase reports"
on public.showcase_reports for select
to authenticated
using (auth.uid() = reporter_id);
