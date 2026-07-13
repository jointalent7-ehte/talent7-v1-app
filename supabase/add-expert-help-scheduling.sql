alter table public.expert_help_requests
add column if not exists session_status text not null default 'Not scheduled' check (
  session_status in ('Not scheduled', 'Proposed', 'Confirmed')
),
add column if not exists proposed_session_at timestamptz,
add column if not exists confirmed_session_at timestamptz,
add column if not exists session_note text,
add column if not exists session_updated_by uuid references auth.users(id) on delete set null;

drop policy if exists "Requesters can schedule own expert help requests" on public.expert_help_requests;
drop policy if exists "Assigned experts can schedule expert help requests" on public.expert_help_requests;

create policy "Requesters can schedule own expert help requests"
on public.expert_help_requests for update
to authenticated
using (auth.uid() = requester_id)
with check (
  auth.uid() = requester_id
  and session_status in ('Proposed', 'Confirmed')
);

create policy "Assigned experts can schedule expert help requests"
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
  session_status in ('Proposed', 'Confirmed')
  and exists (
    select 1
    from public.expert_profiles
    where expert_profiles.id = expert_help_requests.assigned_expert_id
      and expert_profiles.user_id = auth.uid()
  )
);
