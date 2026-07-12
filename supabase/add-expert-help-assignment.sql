alter table public.expert_help_requests
add column if not exists assigned_expert_id uuid references public.expert_profiles(id) on delete set null,
add column if not exists assigned_expert_name text;

alter table public.expert_help_requests
drop constraint if exists expert_help_requests_status_check;

alter table public.expert_help_requests
add constraint expert_help_requests_status_check
check (status in ('Open', 'In review', 'Assigned', 'Closed'));
