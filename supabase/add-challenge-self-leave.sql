-- Allow signed-in participants to leave their own active-room membership safely.

drop policy if exists "Users can leave active challenge rooms" on public.challenge_joins;
create policy "Users can leave active challenge rooms"
on public.challenge_joins for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.challenges
    where challenges.id = challenge_joins.challenge_id
      and challenges.status <> 'Completed'
      and challenges.created_by <> auth.uid()
      and (
        challenge_joins.role = 'Audience'
        or (
          coalesce(challenges.voting_status, 'Closed') <> 'Open'
          and not exists (
            select 1
            from public.challenge_live_sessions
            where challenge_live_sessions.challenge_id = challenge_joins.challenge_id
              and challenge_live_sessions.status = 'Live'
          )
        )
      )
  )
);

create or replace function public.cancel_schedule_after_challenger_leaves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'Challenger'
     and exists (
       select 1 from public.challenges where challenges.id = old.challenge_id
     )
     and not public.challenge_has_opposing_players(old.challenge_id) then
    update public.challenge_schedules
    set status = 'Cancelled',
        confirmed_by = null,
        updated_at = now()
    where challenge_id = old.challenge_id
      and status <> 'Cancelled';
  end if;

  return old;
end;
$$;

drop trigger if exists cancel_schedule_after_challenger_leaves_trigger on public.challenge_joins;
create trigger cancel_schedule_after_challenger_leaves_trigger
after delete on public.challenge_joins
for each row execute function public.cancel_schedule_after_challenger_leaves();

revoke all on function public.cancel_schedule_after_challenger_leaves() from public;
