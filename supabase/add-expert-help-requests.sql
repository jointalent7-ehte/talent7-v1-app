create extension if not exists "uuid-ossp";

create table if not exists public.expert_help_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  help_type text not null check (
    help_type in (
      'Medical guidance',
      'Plumbing',
      'Electrical',
      'Tech help',
      'Fitness injury',
      'Other urgent help'
    )
  ),
  urgency text not null check (
    urgency in (
      'Need guidance soon',
      'Can wait',
      'Urgent but not life-threatening'
    )
  ),
  location text,
  details text not null,
  status text not null default 'Open' check (status in ('Open', 'In review', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.expert_help_requests enable row level security;

drop policy if exists "Users can create own expert help requests" on public.expert_help_requests;
drop policy if exists "Users can read own expert help requests" on public.expert_help_requests;
drop policy if exists "Owners can read all expert help requests" on public.expert_help_requests;
drop policy if exists "Owners can update expert help requests" on public.expert_help_requests;

create policy "Users can create own expert help requests"
on public.expert_help_requests for insert
to authenticated
with check (auth.uid() = requester_id);

create policy "Users can read own expert help requests"
on public.expert_help_requests for select
to authenticated
using (auth.uid() = requester_id);

create policy "Owners can read all expert help requests"
on public.expert_help_requests for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update expert help requests"
on public.expert_help_requests for update
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
