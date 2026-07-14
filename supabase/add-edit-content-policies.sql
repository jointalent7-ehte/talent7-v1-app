drop policy if exists "Challenge creators can update own open challenges" on public.challenges;
drop policy if exists "Owners can update any challenge details" on public.challenges;
drop policy if exists "Users can update own proofs" on public.proofs;
drop policy if exists "Owners can update any proof" on public.proofs;
drop policy if exists "Users can update own showcase posts" on public.showcase_posts;
drop policy if exists "Owners can update any showcase post" on public.showcase_posts;

create policy "Challenge creators can update own open challenges"
on public.challenges for update
to authenticated
using (auth.uid() = created_by and status <> 'Completed')
with check (auth.uid() = created_by);

create policy "Owners can update any challenge details"
on public.challenges for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Users can update own proofs"
on public.proofs for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Owners can update any proof"
on public.proofs for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Users can update own showcase posts"
on public.showcase_posts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Owners can update any showcase post"
on public.showcase_posts for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);
