-- Add locality discovery and moderated audio roles to restored Listen rooms.
-- Run after restore-listen-rooms.sql.

alter table public.listen_rooms
  add column if not exists area_name text not null default 'Global',
  add column if not exists area_slug text not null default 'global',
  add column if not exists city_name text not null default 'Global',
  add column if not exists country_name text not null default 'Global',
  add column if not exists voice_enabled boolean not null default true;

alter table public.listen_rooms
  drop constraint if exists listen_rooms_area_name_check,
  drop constraint if exists listen_rooms_area_slug_check,
  drop constraint if exists listen_rooms_city_name_check,
  drop constraint if exists listen_rooms_country_name_check;

alter table public.listen_rooms
  add constraint listen_rooms_area_name_check check (char_length(area_name) between 1 and 80),
  add constraint listen_rooms_area_slug_check check (area_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(area_slug) <= 80),
  add constraint listen_rooms_city_name_check check (char_length(city_name) between 1 and 80),
  add constraint listen_rooms_country_name_check check (char_length(country_name) between 1 and 80);

create index if not exists listen_rooms_area_status_created_at_idx
on public.listen_rooms (area_slug, status, created_at desc);

alter table public.listen_room_members
  add column if not exists role text not null default 'Listener',
  add column if not exists speaker_requested boolean not null default false;

alter table public.listen_room_members
  drop constraint if exists listen_room_members_role_check;

alter table public.listen_room_members
  add constraint listen_room_members_role_check check (role in ('Host', 'Speaker', 'Listener'));

update public.listen_room_members members
set role = 'Host', speaker_requested = false
from public.listen_rooms rooms
where rooms.id = members.room_id
  and rooms.created_by = members.user_id;

create or replace function public.seed_listen_room_host()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.listen_room_members (room_id, user_id, display_name, role)
  values (new.id, new.created_by, new.host_name, 'Host')
  on conflict (room_id, user_id) do update
  set role = 'Host', speaker_requested = false;
  return new;
end;
$$;

create or replace function public.create_local_listen_room(
  room_title text,
  room_host_name text,
  room_mood text,
  room_note_value text,
  room_track_title text,
  room_track_url text,
  room_visibility text,
  room_area_name text,
  room_city_name text,
  room_country_name text,
  room_voice_enabled boolean,
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
  normalized_area text;
  normalized_city text;
  normalized_country text;
  normalized_slug text;
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

  normalized_area := coalesce(nullif(trim(room_area_name), ''), 'Global');
  normalized_city := coalesce(nullif(trim(room_city_name), ''), 'Global');
  normalized_country := coalesce(nullif(trim(room_country_name), ''), 'Global');

  if char_length(normalized_area) > 80 or char_length(normalized_city) > 80 or char_length(normalized_country) > 80 then
    raise exception 'Area, city, and country must each be 80 characters or fewer';
  end if;

  normalized_slug := trim(both '-' from regexp_replace(lower(normalized_area), '[^a-z0-9]+', '-', 'g'));
  if normalized_slug = '' then
    normalized_slug := 'local-area';
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
    requires_passcode,
    area_name,
    area_slug,
    city_name,
    country_name,
    voice_enabled
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
    room_visibility = 'Private',
    normalized_area,
    normalized_slug,
    normalized_city,
    normalized_country,
    coalesce(room_voice_enabled, true)
  ) returning id into new_room_id;

  if room_visibility = 'Private' then
    insert into public.listen_room_secrets (room_id, passcode_hash)
    values (new_room_id, crypt(room_passcode, gen_salt('bf', 10)));
  end if;

  return new_room_id;
end;
$$;

create or replace function public.request_listen_microphone(target_room_id uuid)
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
    select 1
    from public.listen_rooms
    where id = target_room_id
      and status = 'Open'
      and voice_enabled = true
  ) then
    raise exception 'Voice room is not open';
  end if;

  update public.listen_room_members
  set speaker_requested = true
  where room_id = target_room_id
    and user_id = auth.uid()
    and role = 'Listener';

  if not found then
    raise exception 'Join this Listen room as a listener before requesting the microphone';
  end if;
end;
$$;

create or replace function public.set_listen_member_voice_role(
  target_room_id uuid,
  target_user_id uuid,
  next_role text
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

  if next_role not in ('Speaker', 'Listener') then
    raise exception 'A host can assign only Speaker or Listener';
  end if;

  if not exists (
    select 1
    from public.listen_rooms
    where id = target_room_id
      and created_by = auth.uid()
  ) then
    raise exception 'Only the room host can manage microphones';
  end if;

  update public.listen_room_members
  set role = next_role, speaker_requested = false
  where room_id = target_room_id
    and user_id = target_user_id
    and role <> 'Host';

  if not found then
    raise exception 'Listen room member not found';
  end if;
end;
$$;

revoke all on function public.create_local_listen_room(text, text, text, text, text, text, text, text, text, text, boolean, text) from public;
revoke all on function public.request_listen_microphone(uuid) from public;
revoke all on function public.set_listen_member_voice_role(uuid, uuid, text) from public;

grant execute on function public.create_local_listen_room(text, text, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.request_listen_microphone(uuid) to authenticated;
grant execute on function public.set_listen_member_voice_role(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
