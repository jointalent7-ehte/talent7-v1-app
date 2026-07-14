create extension if not exists "uuid-ossp";

create table if not exists public.challenge_messages (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

alter table public.challenge_messages enable row level security;

drop policy if exists "Challenge participants can read room messages" on public.challenge_messages;
drop policy if exists "Challenge participants can create room messages" on public.challenge_messages;

create policy "Challenge participants can read room messages"
on public.challenge_messages for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.challenges
    where challenges.id = challenge_messages.challenge_id
      and challenges.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.challenge_joins
    where challenge_joins.challenge_id = challenge_messages.challenge_id
      and challenge_joins.user_id = auth.uid()
  )
);

create policy "Challenge participants can create room messages"
on public.challenge_messages for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.challenges
    where challenges.id = challenge_messages.challenge_id
      and challenges.status <> 'Completed'
  )
  and (
    exists (
      select 1
      from public.challenges
      where challenges.id = challenge_messages.challenge_id
        and challenges.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.challenge_joins
      where challenge_joins.challenge_id = challenge_messages.challenge_id
        and challenge_joins.user_id = auth.uid()
    )
  )
);
