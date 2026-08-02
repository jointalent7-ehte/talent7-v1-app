-- Run this after all earlier Talent7 migrations.
-- It replaces the broad MVP update/insert rules with server-enforced ownership and team-role checks.

drop policy if exists "Signed in can complete challenges" on public.challenges;
drop policy if exists "Authorized users can complete challenges" on public.challenges;

create policy "Authorized users can complete challenges"
on public.challenges for update
to authenticated
using (
  auth.uid() = created_by
  or exists (
    select 1 from public.app_admins
    where app_admins.user_id = auth.uid()
  )
  or exists (
    select 1 from public.talent_teams
    where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
      and talent_teams.owner_user_id = auth.uid()
  )
  or exists (
    select 1 from public.team_join_requests
    where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
      and team_join_requests.requester_user_id = auth.uid()
      and team_join_requests.status = 'Accepted'
      and team_join_requests.member_role in ('Captain', 'Organizer')
  )
)
with check (
  completed_by = auth.uid()
  and (
    auth.uid() = created_by
    or exists (
      select 1 from public.app_admins
      where app_admins.user_id = auth.uid()
    )
    or exists (
      select 1 from public.talent_teams
      where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
        and talent_teams.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
        and team_join_requests.requester_user_id = auth.uid()
        and team_join_requests.status = 'Accepted'
        and team_join_requests.member_role in ('Captain', 'Organizer')
    )
  )
);

drop policy if exists "Signed in can create proofs" on public.proofs;
drop policy if exists "Authorized users can create proofs" on public.proofs;

create policy "Authorized users can create proofs"
on public.proofs for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.challenges
    where challenges.id = proofs.challenge_id
      and (
        challenges.created_by = auth.uid()
        or exists (
          select 1 from public.app_admins
          where app_admins.user_id = auth.uid()
        )
        or (
          challenges.team_a_id is null
          and challenges.team_b_id is null
          and exists (
            select 1 from public.challenge_joins
            where challenge_joins.challenge_id = challenges.id
              and challenge_joins.user_id = auth.uid()
              and challenge_joins.role = 'Challenger'
          )
        )
        or exists (
          select 1 from public.talent_teams
          where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
            and talent_teams.owner_user_id = auth.uid()
        )
        or exists (
          select 1 from public.team_join_requests
          where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
            and team_join_requests.requester_user_id = auth.uid()
            and team_join_requests.status = 'Accepted'
            and team_join_requests.member_role in ('Captain', 'Organizer', 'Proof uploader')
        )
      )
  )
);
