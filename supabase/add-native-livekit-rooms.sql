alter table public.challenge_live_sessions
  alter column youtube_video_id drop not null;

alter table public.challenge_live_sessions
  drop constraint if exists challenge_live_youtube_id_format;

alter table public.challenge_live_sessions
  add column if not exists provider text not null default 'YouTube',
  add column if not exists livekit_room_name text;

alter table public.challenge_live_sessions
  drop constraint if exists challenge_live_provider_check;

alter table public.challenge_live_sessions
  add constraint challenge_live_provider_check
  check (provider in ('YouTube', 'LiveKit'));

alter table public.challenge_live_sessions
  drop constraint if exists challenge_live_provider_configuration;

alter table public.challenge_live_sessions
  add constraint challenge_live_provider_configuration
  check (
    (provider = 'YouTube'
      and youtube_video_id is not null
      and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
      and livekit_room_name is null)
    or
    (provider = 'LiveKit'
      and youtube_video_id is null
      and livekit_room_name is not null
      and livekit_room_name ~ '^talent7-challenge-[0-9a-f-]{36}$')
  );

drop function if exists public.set_challenge_live_session(uuid, text, text);

create or replace function public.set_challenge_live_session(
  target_challenge_id uuid,
  target_youtube_video_id text,
  target_status text,
  target_provider text default 'YouTube'
)
returns setof public.challenge_live_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  existing_session public.challenge_live_sessions%rowtype;
  selected_provider text := coalesce(nullif(trim(target_provider), ''), 'YouTube');
  selected_youtube_id text := nullif(trim(target_youtube_video_id), '');
  selected_livekit_room text;
  should_reset_reactions boolean := false;
begin
  if not public.can_manage_challenge_live(target_challenge_id, acting_user) then
    raise exception 'You do not have permission to manage this room broadcast';
  end if;

  if target_status not in ('Ready', 'Live', 'Ended') then
    raise exception 'Invalid live session status';
  end if;

  if selected_provider not in ('YouTube', 'LiveKit') then
    raise exception 'Invalid live provider';
  end if;

  select * into existing_session
  from public.challenge_live_sessions
  where challenge_id = target_challenge_id;

  if existing_session.id is not null
     and existing_session.status = 'Live'
     and target_status = 'Ready' then
    raise exception 'End the current broadcast before preparing another one';
  end if;

  if target_status = 'Ended' then
    if existing_session.id is null or existing_session.status <> 'Live' then
      raise exception 'Only a live broadcast can be ended';
    end if;

    update public.challenge_live_sessions
    set status = 'Ended',
        updated_by = acting_user,
        ended_at = now(),
        updated_at = now()
    where challenge_id = target_challenge_id;

    return query select * from public.challenge_live_sessions where challenge_id = target_challenge_id;
    return;
  end if;

  if selected_provider = 'YouTube' then
    if selected_youtube_id is null or selected_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception 'Enter a valid YouTube video or live URL';
    end if;
    selected_livekit_room := null;
  else
    selected_youtube_id := null;
    selected_livekit_room := 'talent7-challenge-' || target_challenge_id::text;
  end if;

  should_reset_reactions := existing_session.id is not null and (
    existing_session.status = 'Ended'
    or existing_session.provider is distinct from selected_provider
    or existing_session.youtube_video_id is distinct from selected_youtube_id
    or existing_session.livekit_room_name is distinct from selected_livekit_room
  );

  if should_reset_reactions then
    delete from public.challenge_live_reactions where live_session_id = existing_session.id;
    delete from public.challenge_live_reaction_totals where live_session_id = existing_session.id;
  end if;

  insert into public.challenge_live_sessions (
    challenge_id, youtube_video_id, provider, livekit_room_name, status,
    created_by, updated_by, started_at, ended_at, created_at, updated_at
  ) values (
    target_challenge_id, selected_youtube_id, selected_provider, selected_livekit_room, target_status,
    acting_user, acting_user,
    case when target_status = 'Live' then now() else null end,
    null, now(), now()
  )
  on conflict (challenge_id) do update
  set youtube_video_id = excluded.youtube_video_id,
      provider = excluded.provider,
      livekit_room_name = excluded.livekit_room_name,
      status = excluded.status,
      updated_by = acting_user,
      started_at = case
        when excluded.status = 'Live'
          and challenge_live_sessions.status = 'Live'
          and challenge_live_sessions.provider = excluded.provider
          and challenge_live_sessions.youtube_video_id is not distinct from excluded.youtube_video_id
          and challenge_live_sessions.livekit_room_name is not distinct from excluded.livekit_room_name
          then challenge_live_sessions.started_at
        when excluded.status = 'Live' then now()
        else null
      end,
      ended_at = null,
      updated_at = now();

  return query select * from public.challenge_live_sessions where challenge_id = target_challenge_id;
end;
$$;

revoke all on function public.set_challenge_live_session(uuid, text, text, text) from public;
grant execute on function public.set_challenge_live_session(uuid, text, text, text) to authenticated;

comment on table public.challenge_live_sessions is
  'Organizer-controlled native LiveKit or YouTube fallback broadcasts embedded in Talent7 challenge rooms.';
