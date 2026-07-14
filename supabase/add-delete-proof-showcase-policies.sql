drop policy if exists "Users can delete own proofs" on public.proofs;
drop policy if exists "Owners can delete any proof" on public.proofs;
drop policy if exists "Users can delete own showcase posts" on public.showcase_posts;
drop policy if exists "Owners can delete any showcase post" on public.showcase_posts;

create policy "Users can delete own proofs"
on public.proofs for delete
to authenticated
using (auth.uid() = user_id);

create policy "Owners can delete any proof"
on public.proofs for delete
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Users can delete own showcase posts"
on public.showcase_posts for delete
to authenticated
using (auth.uid() = user_id);

create policy "Owners can delete any showcase post"
on public.showcase_posts for delete
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);
