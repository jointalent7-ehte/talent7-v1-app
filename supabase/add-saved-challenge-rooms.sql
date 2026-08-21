create extension if not exists "uuid-ossp";

create table if not exists public.challenge_room_saves (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint challenge_room_saves_unique_user_room unique (user_id, challenge_id)
);

create index if not exists challenge_room_saves_user_recent_idx
on public.challenge_room_saves (user_id, created_at desc);

alter table public.challenge_room_saves enable row level security;

drop policy if exists "Users can read own saved rooms" on public.challenge_room_saves;
drop policy if exists "Users can save rooms" on public.challenge_room_saves;
drop policy if exists "Users can remove own saved rooms" on public.challenge_room_saves;

create policy "Users can read own saved rooms"
on public.challenge_room_saves for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save rooms"
on public.challenge_room_saves for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can remove own saved rooms"
on public.challenge_room_saves for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.challenge_room_saves to authenticated;

comment on table public.challenge_room_saves is
  'Private per-user challenge room bookmarks used by the Saved rooms collection.';
