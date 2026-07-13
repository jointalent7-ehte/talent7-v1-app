alter table public.expert_help_requests
add column if not exists session_completed_at timestamptz,
add column if not exists session_completed_by uuid references auth.users(id) on delete set null,
add column if not exists expert_rating integer check (expert_rating between 1 and 7),
add column if not exists expert_feedback text,
add column if not exists expert_feedback_at timestamptz;

drop policy if exists "Requesters can complete expert sessions" on public.expert_help_requests;

create policy "Requesters can complete expert sessions"
on public.expert_help_requests for update
to authenticated
using (auth.uid() = requester_id)
with check (
  auth.uid() = requester_id
  and status = 'Closed'
  and session_status = 'Confirmed'
  and session_link is not null
  and expert_rating between 1 and 7
);
