create extension if not exists "uuid-ossp";

create table if not exists public.challenge_invites (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_name text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists challenge_invites_unique_pair
on public.challenge_invites (challenge_id, from_user_id, invited_user_id);

alter table public.challenge_invites enable row level security;

drop policy if exists "Users can read their challenge invites" on public.challenge_invites;
drop policy if exists "Users can send challenge invites" on public.challenge_invites;
drop policy if exists "Invited users can respond to challenge invites" on public.challenge_invites;

create policy "Users can read their challenge invites"
on public.challenge_invites for select
to authenticated
using (auth.uid() = from_user_id or auth.uid() = invited_user_id);

create policy "Users can send challenge invites"
on public.challenge_invites for insert
to authenticated
with check (auth.uid() = from_user_id);

create policy "Invited users can respond to challenge invites"
on public.challenge_invites for update
to authenticated
using (auth.uid() = invited_user_id)
with check (auth.uid() = invited_user_id);
