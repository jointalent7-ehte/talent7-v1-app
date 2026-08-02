drop policy if exists "Challenge creators can delete untouched open rooms" on public.challenges;
drop policy if exists "Owners can delete any challenge room" on public.challenges;

create policy "Challenge creators can delete untouched open rooms"
on public.challenges for delete
to authenticated
using (
  auth.uid() = created_by
  and status <> 'Completed'
  and not exists (select 1 from public.challenge_joins where challenge_joins.challenge_id = challenges.id)
  and not exists (select 1 from public.ratings where ratings.challenge_id = challenges.id)
  and not exists (select 1 from public.votes where votes.challenge_id = challenges.id)
  and not exists (select 1 from public.proofs where proofs.challenge_id = challenges.id)
  and not exists (select 1 from public.challenge_invites where challenge_invites.challenge_id = challenges.id)
  and not exists (select 1 from public.challenge_messages where challenge_messages.challenge_id = challenges.id)
  and not exists (select 1 from public.reports where reports.challenge_id = challenges.id)
);

create policy "Owners can delete any challenge room"
on public.challenges for delete
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);
