create extension if not exists "uuid-ossp";

create table if not exists public.founder_feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  feedback_type text not null check (feedback_type in ('Bug', 'Confusing', 'Feature request', 'Payment interest', 'General')),
  area text,
  message text not null,
  status text not null default 'New' check (status in ('New', 'Reviewed', 'Planned', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.founder_feedback enable row level security;

drop policy if exists "Users can create own founder feedback" on public.founder_feedback;
drop policy if exists "Users can read own founder feedback" on public.founder_feedback;
drop policy if exists "Owners can read all founder feedback" on public.founder_feedback;
drop policy if exists "Owners can update founder feedback" on public.founder_feedback;

create policy "Users can create own founder feedback"
on public.founder_feedback for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can read own founder feedback"
on public.founder_feedback for select
to authenticated
using (auth.uid() = user_id);

create policy "Owners can read all founder feedback"
on public.founder_feedback for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update founder feedback"
on public.founder_feedback for update
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
