-- Notify a Listen room host when a listener asks for microphone access.
-- Run after add-area-voice-listen-rooms.sql.

create or replace function public.request_listen_microphone(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  host_user_id uuid;
  listen_room_title text;
  requester_name text;
begin
  if acting_user is null then
    raise exception 'Authentication required';
  end if;

  select created_by, title
  into host_user_id, listen_room_title
  from public.listen_rooms
  where id = target_room_id
    and status = 'Open'
    and voice_enabled = true;

  if host_user_id is null then
    raise exception 'Voice room is not open';
  end if;

  update public.listen_room_members
  set speaker_requested = true
  where room_id = target_room_id
    and user_id = acting_user
    and role = 'Listener'
    and speaker_requested = false
  returning display_name into requester_name;

  if requester_name is null then
    if exists (
      select 1
      from public.listen_room_members
      where room_id = target_room_id
        and user_id = acting_user
        and role = 'Listener'
        and speaker_requested = true
    ) then
      return;
    end if;

    raise exception 'Join this Listen room as a listener before requesting the microphone';
  end if;

  perform public.enqueue_push_notification(
    host_user_id,
    acting_user,
    'Live room',
    'Microphone requested',
    requester_name || ' asked to speak in ' || listen_room_title || '.',
    '#listen-rooms',
    'listen_room',
    target_room_id
  );
end;
$$;

revoke all on function public.request_listen_microphone(uuid) from public;
grant execute on function public.request_listen_microphone(uuid) to authenticated;

notify pgrst, 'reload schema';
