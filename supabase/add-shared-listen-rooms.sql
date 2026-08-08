create extension if not exists "uuid-ossp";

create table if not exists public.listen_rooms (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  host_name text not null check (char_length(host_name) between 1 and 80),
  mood text not null check (mood in ('Chill', 'Workout', 'Focus', 'Romantic', 'Party', 'Road trip', 'Study', 'Open vibe')),
  room_note text check (room_note is null or char_length(room_note) <= 400),
  current_track_title text not null default 'Open the first shared song' check (char_length(current_track_title) between 1 and 160),
  current_track_url text not null default 'https://www.youtube.com' check (current_track_url ~* '^https?://'),
  listener_count integer not null default 1 check (listener_count >= 0),
  love_count integer not null default 0 check (love_count >= 0),
  vibe_count integer not null default 0 check (vibe_count >= 0),
  status text not null default 'Open' check (status in ('Open', 'Archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listen_room_members (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.listen_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.listen_room_reactions (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.listen_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('love', 'vibe')),
  created_at timestamptz not null default now(),
  unique (room_id, user_id, reaction)
);

create table if not exists public.listen_tracks (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.listen_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  track_title text not null check (char_length(track_title) between 1 and 160),
  track_url text not null check (track_url ~* '^https?://'),
  added_by text not null check (char_length(added_by) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists listen_rooms_status_created_at_idx
on public.listen_rooms (status, created_at desc);

create index if not exists listen_tracks_room_created_at_idx
on public.listen_tracks (room_id, created_at desc);

alter table public.listen_rooms enable row level security;
alter table public.listen_room_members enable row level security;
alter table public.listen_room_reactions enable row level security;
alter table public.listen_tracks enable row level security;

drop policy if exists "Anyone can read open listen rooms" on public.listen_rooms;
drop policy if exists "Users can create listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can update listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can delete listen rooms" on public.listen_rooms;

create policy "Anyone can read open listen rooms"
on public.listen_rooms for select
using (status = 'Open' or auth.uid() = created_by);

create policy "Users can create listen rooms"
on public.listen_rooms for insert
to authenticated
with check (auth.uid() = created_by and status = 'Open');

create policy "Hosts can update listen rooms"
on public.listen_rooms for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "Hosts can delete listen rooms"
on public.listen_rooms for delete
to authenticated
using (auth.uid() = created_by);

drop policy if exists "Anyone can read members of open listen rooms" on public.listen_room_members;
drop policy if exists "Users can join open listen rooms" on public.listen_room_members;
drop policy if exists "Users can leave listen rooms" on public.listen_room_members;

create policy "Anyone can read members of open listen rooms"
on public.listen_room_members for select
using (
  exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_room_members.room_id
      and (listen_rooms.status = 'Open' or listen_rooms.created_by = auth.uid())
  )
);

create policy "Users can join open listen rooms"
on public.listen_room_members for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_room_members.room_id
      and listen_rooms.status = 'Open'
  )
);

create policy "Users can leave listen rooms"
on public.listen_room_members for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Anyone can read reactions in open listen rooms" on public.listen_room_reactions;
drop policy if exists "Members can react in listen rooms" on public.listen_room_reactions;
drop policy if exists "Users can remove own listen reactions" on public.listen_room_reactions;

create policy "Anyone can read reactions in open listen rooms"
on public.listen_room_reactions for select
using (
  exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_room_reactions.room_id
      and (listen_rooms.status = 'Open' or listen_rooms.created_by = auth.uid())
  )
);

create policy "Members can react in listen rooms"
on public.listen_room_reactions for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.listen_room_members
    where listen_room_members.room_id = listen_room_reactions.room_id
      and listen_room_members.user_id = auth.uid()
  )
);

create policy "Users can remove own listen reactions"
on public.listen_room_reactions for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Anyone can read tracks in open listen rooms" on public.listen_tracks;
drop policy if exists "Members can add listen tracks" on public.listen_tracks;
drop policy if exists "Users and hosts can delete listen tracks" on public.listen_tracks;

create policy "Anyone can read tracks in open listen rooms"
on public.listen_tracks for select
using (
  exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_tracks.room_id
      and (listen_rooms.status = 'Open' or listen_rooms.created_by = auth.uid())
  )
);

create policy "Members can add listen tracks"
on public.listen_tracks for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_tracks.room_id
      and listen_rooms.status = 'Open'
  )
  and (
    exists (
      select 1 from public.listen_rooms
      where listen_rooms.id = listen_tracks.room_id
        and listen_rooms.created_by = auth.uid()
    )
    or exists (
      select 1 from public.listen_room_members
      where listen_room_members.room_id = listen_tracks.room_id
        and listen_room_members.user_id = auth.uid()
    )
  )
);

create policy "Users and hosts can delete listen tracks"
on public.listen_tracks for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_tracks.room_id
      and listen_rooms.created_by = auth.uid()
  )
);

create or replace function public.seed_listen_room_host()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.listen_room_members (room_id, user_id, display_name)
  values (new.id, new.created_by, new.host_name)
  on conflict (room_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.refresh_listen_room_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room_id uuid;
begin
  target_room_id := coalesce(new.room_id, old.room_id);

  update public.listen_rooms
  set
    listener_count = (select count(*) from public.listen_room_members where room_id = target_room_id),
    love_count = (select count(*) from public.listen_room_reactions where room_id = target_room_id and reaction = 'love'),
    vibe_count = (select count(*) from public.listen_room_reactions where room_id = target_room_id and reaction = 'vibe'),
    updated_at = now()
  where id = target_room_id;

  return coalesce(new, old);
end;
$$;

create or replace function public.promote_latest_listen_track()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.listen_rooms
  set current_track_title = new.track_title,
      current_track_url = new.track_url,
      updated_at = now()
  where id = new.room_id;
  return new;
end;
$$;

drop trigger if exists seed_listen_room_host_trigger on public.listen_rooms;
create trigger seed_listen_room_host_trigger
after insert on public.listen_rooms
for each row execute function public.seed_listen_room_host();

drop trigger if exists refresh_listen_member_counts_trigger on public.listen_room_members;
create trigger refresh_listen_member_counts_trigger
after insert or delete on public.listen_room_members
for each row execute function public.refresh_listen_room_counts();

drop trigger if exists refresh_listen_reaction_counts_trigger on public.listen_room_reactions;
create trigger refresh_listen_reaction_counts_trigger
after insert or delete on public.listen_room_reactions
for each row execute function public.refresh_listen_room_counts();

drop trigger if exists promote_latest_listen_track_trigger on public.listen_tracks;
create trigger promote_latest_listen_track_trigger
after insert on public.listen_tracks
for each row execute function public.promote_latest_listen_track();

grant select on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks to anon, authenticated;
grant insert on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks to authenticated;
grant delete on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks to authenticated;
revoke update on public.listen_rooms from authenticated;
grant update (title, mood, room_note, status) on public.listen_rooms to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.listen_rooms;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.listen_tracks;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.listen_room_members;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.listen_room_reactions;
exception when duplicate_object then null;
end;
$$;
