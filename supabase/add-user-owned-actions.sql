alter table public.challenges
add column if not exists created_by uuid references auth.users(id),
add column if not exists completed_by uuid references auth.users(id);

alter table public.challenge_joins
add column if not exists user_id uuid references auth.users(id);

alter table public.ratings
add column if not exists user_id uuid references auth.users(id);

alter table public.votes
add column if not exists user_id uuid references auth.users(id);

alter table public.proofs
add column if not exists user_id uuid references auth.users(id);

drop policy if exists "Public can create challenges during MVP" on public.challenges;
drop policy if exists "Public can create ratings during MVP" on public.ratings;
drop policy if exists "Public can create votes during MVP" on public.votes;
drop policy if exists "Public can create proofs during MVP" on public.proofs;
drop policy if exists "Public can create challenge joins during MVP" on public.challenge_joins;
drop policy if exists "Public can update challenge results during MVP" on public.challenges;

drop policy if exists "Signed in can create challenges" on public.challenges;
drop policy if exists "Signed in can create joins" on public.challenge_joins;
drop policy if exists "Signed in can create ratings" on public.ratings;
drop policy if exists "Signed in can create votes" on public.votes;
drop policy if exists "Signed in can create proofs" on public.proofs;
drop policy if exists "Signed in can complete challenges" on public.challenges;

create policy "Signed in can create challenges"
on public.challenges for insert
to authenticated
with check (auth.uid() = created_by);

create policy "Signed in can create joins"
on public.challenge_joins for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Signed in can create ratings"
on public.ratings for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Signed in can create votes"
on public.votes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Signed in can create proofs"
on public.proofs for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Signed in can complete challenges"
on public.challenges for update
to authenticated
using (true)
with check (auth.uid() = completed_by);
