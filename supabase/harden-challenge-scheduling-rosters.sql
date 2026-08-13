-- Do not allow private scheduling until both sides have a registered challenger.
-- This protects the invariant at the database layer, even if an older client is used.

create or replace function public.challenge_has_opposing_players(target_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and exists (
        select 1
        from public.challenge_joins
        where challenge_joins.challenge_id = challenges.id
          and challenge_joins.role = 'Challenger'
          and challenge_joins.side = 'Team A'
      )
      and exists (
        select 1
        from public.challenge_joins
        where challenge_joins.challenge_id = challenges.id
          and challenge_joins.role = 'Challenger'
          and challenge_joins.side = 'Team B'
      )
  );
$$;

create or replace function public.enforce_challenge_schedule_roster_ready()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.challenge_has_opposing_players(new.challenge_id) then
    raise exception 'A registered challenger is required on both sides before scheduling can begin';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_challenge_schedule_roster_ready_trigger
on public.challenge_schedules;

create trigger enforce_challenge_schedule_roster_ready_trigger
before insert or update of scheduled_for, timezone, play_mode, venue_name,
  meeting_details, session_url, note, proposed_by, status
on public.challenge_schedules
for each row
when (new.status <> 'Cancelled')
execute function public.enforce_challenge_schedule_roster_ready();

revoke all on function public.enforce_challenge_schedule_roster_ready() from public;
revoke all on function public.challenge_has_opposing_players(uuid) from public;
grant execute on function public.challenge_has_opposing_players(uuid) to authenticated;

-- Retain any earlier proposal for audit/history, but do not leave an invalid
-- proposal active when the room currently has no registered opposing side.
update public.challenge_schedules
set status = 'Cancelled',
    confirmed_by = null,
    updated_at = now()
where status <> 'Cancelled'
  and not public.challenge_has_opposing_players(challenge_id);

drop policy if exists "Participants can propose challenge schedules" on public.challenge_schedules;
drop policy if exists "Participants can update challenge schedules" on public.challenge_schedules;

create policy "Participants can propose challenge schedules"
on public.challenge_schedules for insert
to authenticated
with check (
  proposed_by = auth.uid()
  and public.can_coordinate_challenge(challenge_id, auth.uid())
  and public.challenge_has_opposing_players(challenge_id)
);

create policy "Participants can update challenge schedules"
on public.challenge_schedules for update
to authenticated
using (public.can_coordinate_challenge(challenge_id, auth.uid()))
with check (
  public.can_coordinate_challenge(challenge_id, auth.uid())
  and (
    status = 'Cancelled'
    or public.challenge_has_opposing_players(challenge_id)
  )
);
