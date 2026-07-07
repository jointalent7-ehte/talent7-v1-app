drop policy if exists "Coaches can update coaching interest status" on public.coaching_interests;

create policy "Coaches can update coaching interest status"
on public.coaching_interests for update
to authenticated
using (
  exists (
    select 1
    from public.coach_offers
    where coach_offers.id = coaching_interests.offer_id
      and coach_offers.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.coach_offers
    where coach_offers.id = coaching_interests.offer_id
      and coach_offers.user_id = auth.uid()
  )
);
