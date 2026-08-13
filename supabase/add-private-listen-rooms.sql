create extension if not exists pgcrypto;

alter table public.listen_rooms
  add column if not exists visibility text not null default 'Public',
  add column if not exists room_code text,
  add column if not exists requires_passcode boolean not null default false;

alter table public.listen_rooms
  drop constraint if exists listen_rooms_visibility_check;

alter table public.listen_rooms
  add constraint listen_rooms_visibility_check
  check (visibility in ('Public', 'Private'));

alter table public.listen_rooms
  drop constraint if exists listen_rooms_private_access_check;

alter table public.listen_rooms
  add constraint listen_rooms_private_access_check
  check (
    (visibility = 'Public' and room_code is null and requires_passcode = false)
    or
    (visibility = 'Private' and room_code is not null and requires_passcode = true)
  );

create unique index if not exists listen_rooms_room_code_unique_idx
on public.listen_rooms (upper(room_code))
where room_code is not null;

create table if not exists public.listen_room_secrets (
  room_id uuid primary key references public.listen_rooms(id) on delete cascade,
  passcode_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.listen_room_secrets enable row level security;
revoke all on public.listen_room_secrets from anon, authenticated;

create or replace function public.is_listen_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.listen_room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_listen_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.listen_rooms
    where id = target_room_id
      and (
        created_by = auth.uid()
        or (
          status = 'Open'
          and (
            visibility = 'Public'
            or public.is_listen_room_member(id)
          )
        )
      )
  );
$$;

revoke all on function public.is_listen_room_member(uuid) from public;
revoke all on function public.can_access_listen_room(uuid) from public;
grant execute on function public.is_listen_room_member(uuid) to anon, authenticated;
grant execute on function public.can_access_listen_room(uuid) to anon, authenticated;

drop policy if exists "Anyone can read open listen rooms" on public.listen_rooms;
drop policy if exists "People can access allowed listen rooms" on public.listen_rooms;

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

drop policy if exists "Users can create listen rooms" on public.listen_rooms;
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

drop policy if exists "Anyone can read members of open listen rooms" on public.listen_room_members;
create policy "People can read members of allowed listen rooms"
on public.listen_room_members for select
using (public.can_access_listen_room(room_id));

drop policy if exists "Users can join open listen rooms" on public.listen_room_members;
create policy "Users can directly join public listen rooms"
on public.listen_room_members for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.listen_rooms
    where id = listen_room_members.room_id
      and status = 'Open'
      and visibility = 'Public'
  )
);

drop policy if exists "Anyone can read reactions in open listen rooms" on public.listen_room_reactions;
create policy "People can read reactions in allowed listen rooms"
on public.listen_room_reactions for select
using (public.can_access_listen_room(room_id));

drop policy if exists "Anyone can read tracks in open listen rooms" on public.listen_tracks;
create policy "People can read tracks in allowed listen rooms"
on public.listen_tracks for select
using (public.can_access_listen_room(room_id));

create or replace function public.create_listen_room(
  room_title text,
  room_host_name text,
  room_mood text,
  room_note_value text,
  room_track_title text,
  room_track_url text,
  room_visibility text,
  room_passcode text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  new_room_id uuid;
  new_room_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if room_visibility not in ('Public', 'Private') then
    raise exception 'Invalid room visibility';
  end if;

  if room_visibility = 'Private' and (char_length(coalesce(room_passcode, '')) < 4 or char_length(room_passcode) > 32) then
    raise exception 'Private room passcodes must be between 4 and 32 characters';
  end if;

  if room_visibility = 'Private' then
    loop
      new_room_code := upper(encode(gen_random_bytes(4), 'hex'));
      exit when not exists (
        select 1 from public.listen_rooms where upper(room_code) = new_room_code
      );
    end loop;
  end if;

  insert into public.listen_rooms (
    created_by,
    title,
    host_name,
    mood,
    room_note,
    current_track_title,
    current_track_url,
    status,
    visibility,
    room_code,
    requires_passcode
  ) values (
    auth.uid(),
    room_title,
    room_host_name,
    room_mood,
    nullif(room_note_value, ''),
    room_track_title,
    room_track_url,
    'Open',
    room_visibility,
    new_room_code,
    room_visibility = 'Private'
  ) returning id into new_room_id;

  if room_visibility = 'Private' then
    insert into public.listen_room_secrets (room_id, passcode_hash)
    values (new_room_id, crypt(room_passcode, gen_salt('bf', 10)));
  end if;

  return new_room_id;
end;
$$;

create or replace function public.join_public_listen_room(
  target_room_id uuid,
  member_display_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.listen_rooms
    where id = target_room_id
      and status = 'Open'
      and visibility = 'Public'
  ) then
    raise exception 'Public listen room not found';
  end if;

  insert into public.listen_room_members (room_id, user_id, display_name)
  values (target_room_id, auth.uid(), member_display_name)
  on conflict (room_id, user_id) do nothing;
end;
$$;

create or replace function public.join_private_listen_room(
  requested_room_code text,
  requested_passcode text,
  member_display_name text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select rooms.id
  into target_room_id
  from public.listen_rooms rooms
  join public.listen_room_secrets secrets on secrets.room_id = rooms.id
  where upper(rooms.room_code) = upper(trim(requested_room_code))
    and rooms.status = 'Open'
    and rooms.visibility = 'Private'
    and secrets.passcode_hash = crypt(requested_passcode, secrets.passcode_hash);

  if target_room_id is null then
    raise exception 'Invalid room code or passcode';
  end if;

  insert into public.listen_room_members (room_id, user_id, display_name)
  values (target_room_id, auth.uid(), member_display_name)
  on conflict (room_id, user_id) do nothing;
end;
$$;

revoke all on function public.create_listen_room(text, text, text, text, text, text, text, text) from public;
revoke all on function public.join_public_listen_room(uuid, text) from public;
revoke all on function public.join_private_listen_room(text, text, text) from public;

grant execute on function public.create_listen_room(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.join_public_listen_room(uuid, text) to authenticated;
grant execute on function public.join_private_listen_room(text, text, text) to authenticated;

notify pgrst, 'reload schema';
