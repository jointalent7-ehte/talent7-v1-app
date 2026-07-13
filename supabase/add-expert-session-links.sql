alter table public.expert_help_requests
add column if not exists session_link text,
add column if not exists session_link_note text,
add column if not exists session_link_added_by uuid references auth.users(id) on delete set null,
add column if not exists session_link_added_at timestamptz;

drop policy if exists "Requesters can add expert session links" on public.expert_help_requests;
drop policy if exists "Assigned experts can add expert session links" on public.expert_help_requests;

create policy "Requesters can add expert session links"
on public.expert_help_requests for update
to authenticated
using (auth.uid() = requester_id)
with check (
  auth.uid() = requester_id
  and session_status = 'Confirmed'
);

create policy "Assigned experts can add expert session links"
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
  session_status = 'Confirmed'
  and exists (
    select 1
    from public.expert_profiles
    where expert_profiles.id = expert_help_requests.assigned_expert_id
      and expert_profiles.user_id = auth.uid()
  )
);
