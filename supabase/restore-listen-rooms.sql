-- Restore the existing Listen room feature without changing gaming or challenge-payment restrictions.
-- Run once after retire-listen-and-gaming.sql.

alter table public.listen_rooms enable row level security;
alter table public.listen_room_members enable row level security;
alter table public.listen_room_reactions enable row level security;
alter table public.listen_tracks enable row level security;

drop policy if exists "Anyone can read open listen rooms" on public.listen_rooms;
drop policy if exists "People can access allowed listen rooms" on public.listen_rooms;
drop policy if exists "Users can create listen rooms" on public.listen_rooms;
drop policy if exists "Users can create public listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can update listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can delete listen rooms" on public.listen_rooms;

create policy "People can access allowed listen rooms"
on public.listen_rooms for select
using (
  created_by = auth.uid()
  or (
    status = 'Open'
    and (
      visibility = 'Public'
      or public.is_listen_room_member(id)
    )
  )
);

create policy "Users can create public listen rooms"
on public.listen_rooms for insert
to authenticated
with check (
  auth.uid() = created_by
  and status = 'Open'
  and visibility = 'Public'
  and room_code is null
  and requires_passcode = false
);

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
drop policy if exists "People can read members of allowed listen rooms" on public.listen_room_members;
drop policy if exists "Users can join open listen rooms" on public.listen_room_members;
drop policy if exists "Users can directly join public listen rooms" on public.listen_room_members;
drop policy if exists "Users can leave listen rooms" on public.listen_room_members;

create policy "People can read members of allowed listen rooms"
on public.listen_room_members for select
using (public.can_access_listen_room(room_id));

create policy "Users can directly join public listen rooms"
on public.listen_room_members for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_room_members.room_id
      and status = 'Open'
      and visibility = 'Public'
  )
);

create policy "Users can leave listen rooms"
on public.listen_room_members for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Anyone can read reactions in open listen rooms" on public.listen_room_reactions;
drop policy if exists "People can read reactions in allowed listen rooms" on public.listen_room_reactions;
drop policy if exists "Members can react in listen rooms" on public.listen_room_reactions;
drop policy if exists "Users can remove own listen reactions" on public.listen_room_reactions;

create policy "People can read reactions in allowed listen rooms"
on public.listen_room_reactions for select
using (public.can_access_listen_room(room_id));

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
drop policy if exists "People can read tracks in allowed listen rooms" on public.listen_tracks;
drop policy if exists "Members can add listen tracks" on public.listen_tracks;
drop policy if exists "Users and hosts can delete listen tracks" on public.listen_tracks;

create policy "People can read tracks in allowed listen rooms"
on public.listen_tracks for select
using (public.can_access_listen_room(room_id));

create policy "Members can add listen tracks"
on public.listen_tracks for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.listen_rooms
    where listen_rooms.id = listen_tracks.room_id
      and status = 'Open'
  )
  and (
    exists (
      select 1 from public.listen_rooms
      where listen_rooms.id = listen_tracks.room_id
        and created_by = auth.uid()
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
      and created_by = auth.uid()
  )
);

grant select on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks
  to anon, authenticated;
grant insert on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks
  to authenticated;
grant delete on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks
  to authenticated;
revoke update on public.listen_rooms from authenticated;
grant update (title, mood, room_note, status) on public.listen_rooms to authenticated;

grant execute on function public.is_listen_room_member(uuid) to anon, authenticated;
grant execute on function public.can_access_listen_room(uuid) to anon, authenticated;
grant execute on function public.create_listen_room(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.join_public_listen_room(uuid, text) to authenticated;
grant execute on function public.join_private_listen_room(text, text, text) to authenticated;

notify pgrst, 'reload schema';
