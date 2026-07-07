create extension if not exists "uuid-ossp";

create table if not exists public.challenge_joins (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  participant_name text not null,
  role text not null check (role in ('Challenger', 'Audience')),
  side text not null default 'Open invite',
  created_at timestamptz not null default now()
);

alter table public.challenge_joins enable row level security;

drop policy if exists "Public can read challenge joins" on public.challenge_joins;
drop policy if exists "Public can create challenge joins during MVP" on public.challenge_joins;

create policy "Public can read challenge joins"
on public.challenge_joins for select
using (true);

create policy "Public can create challenge joins during MVP"
on public.challenge_joins for insert
with check (true);
