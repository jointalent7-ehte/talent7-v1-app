alter table public.expert_help_requests
add column if not exists expert_response text,
add column if not exists expert_response_at timestamptz;

alter table public.expert_help_requests
drop constraint if exists expert_help_requests_status_check;

alter table public.expert_help_requests
add constraint expert_help_requests_status_check
check (status in ('Open', 'In review', 'Assigned', 'Responded', 'Closed'));

drop policy if exists "Assigned experts can read assigned expert help requests" on public.expert_help_requests;
drop policy if exists "Assigned experts can respond to expert help requests" on public.expert_help_requests;

create policy "Assigned experts can read assigned expert help requests"
on public.expert_help_requests for select
to authenticated
using (
  exists (
    select 1
    from public.expert_profiles
    where expert_profiles.id = expert_help_requests.assigned_expert_id
      and expert_profiles.user_id = auth.uid()
  )
);

create policy "Assigned experts can respond to expert help requests"
on public.expert_help_requests for update
to authenticated
using (
  exists (
    select 1
    from public.expert_profiles
    where expert_profiles.id = expert_help_requests.assigned_expert_id
      and expert_profiles.user_id = auth.uid()
  )
)
with check (
  status = 'Responded'
  and exists (
    select 1
    from public.expert_profiles
    where expert_profiles.id = expert_help_requests.assigned_expert_id
      and expert_profiles.user_id = auth.uid()
  )
);
