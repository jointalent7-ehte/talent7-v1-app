create extension if not exists "uuid-ossp";

create table if not exists public.challenge_live_sessions (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  youtube_video_id text not null,
  status text not null default 'Ready' check (status in ('Ready', 'Live', 'Ended')),
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenge_live_youtube_id_format
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  constraint challenge_live_timeline
    check (
      (status = 'Ready' and started_at is null and ended_at is null)
      or (status = 'Live' and started_at is not null and ended_at is null)
      or (status = 'Ended' and started_at is not null and ended_at is not null)
    )
);

create index if not exists challenge_live_sessions_status_idx
on public.challenge_live_sessions (status, updated_at desc);

create table if not exists public.challenge_live_reactions (
  id uuid primary key default uuid_generate_v4(),
  live_session_id uuid not null references public.challenge_live_sessions(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('Fire', 'Applause', 'Wow', 'Strong', 'Love')),
  reaction_count integer not null default 1 check (reaction_count between 1 and 1000000),
  last_reacted_at timestamptz not null default now(),
  constraint one_live_reaction_counter_per_user unique (live_session_id, user_id, reaction)
);

create index if not exists challenge_live_reactions_rate_idx
on public.challenge_live_reactions (live_session_id, user_id, last_reacted_at desc);

create table if not exists public.challenge_live_reaction_totals (
  live_session_id uuid not null references public.challenge_live_sessions(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  reaction text not null check (reaction in ('Fire', 'Applause', 'Wow', 'Strong', 'Love')),
  reaction_count bigint not null default 0 check (reaction_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (live_session_id, reaction)
);

create index if not exists challenge_live_reaction_totals_room_idx
on public.challenge_live_reaction_totals (challenge_id);

alter table public.challenge_live_sessions enable row level security;
alter table public.challenge_live_reactions enable row level security;
alter table public.challenge_live_reaction_totals enable row level security;

revoke all on public.challenge_live_sessions from anon, authenticated;
revoke all on public.challenge_live_reactions from anon, authenticated;
revoke all on public.challenge_live_reaction_totals from anon, authenticated;

grant select on public.challenge_live_sessions to anon, authenticated;
grant select on public.challenge_live_reaction_totals to anon, authenticated;

drop policy if exists "Public can view challenge live sessions" on public.challenge_live_sessions;
create policy "Public can view challenge live sessions"
on public.challenge_live_sessions for select
to anon, authenticated
using (true);

drop policy if exists "Public can view challenge live reaction totals" on public.challenge_live_reaction_totals;
create policy "Public can view challenge live reaction totals"
on public.challenge_live_reaction_totals for select
to anon, authenticated
using (true);

create or replace function public.can_manage_challenge_live(
  target_challenge_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id is not null and exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = target_user_id
        or exists (
          select 1 from public.app_admins
          where app_admins.user_id = target_user_id
        )
        or exists (
          select 1 from public.challenge_invites
          where challenge_invites.challenge_id = target_challenge_id
            and challenge_invites.invited_user_id = target_user_id
            and challenge_invites.status = 'Accepted'
        )
        or exists (
          select 1 from public.talent_teams
          where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
            and talent_teams.owner_user_id = target_user_id
        )
        or exists (
          select 1 from public.team_join_requests
          where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
            and team_join_requests.requester_user_id = target_user_id
            and team_join_requests.status = 'Accepted'
            and team_join_requests.member_role in ('Captain', 'Organizer')
        )
      )
  );
$$;

create or replace function public.set_challenge_live_session(
  target_challenge_id uuid,
  target_youtube_video_id text,
  target_status text
)
returns setof public.challenge_live_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  existing_session public.challenge_live_sessions%rowtype;
  should_reset_reactions boolean := false;
begin
  if not public.can_manage_challenge_live(target_challenge_id, acting_user) then
    raise exception 'You do not have permission to manage this room broadcast';
  end if;

  if target_status not in ('Ready', 'Live', 'Ended') then
    raise exception 'Invalid live session status';
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

    return query
    select * from public.challenge_live_sessions where challenge_id = target_challenge_id;
    return;
  end if;

  if target_youtube_video_id is null
     or target_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Enter a valid YouTube video or live URL';
  end if;

  should_reset_reactions :=
    existing_session.id is not null
    and (
      existing_session.youtube_video_id <> target_youtube_video_id
      or existing_session.status = 'Ended'
    );

  if should_reset_reactions then
    delete from public.challenge_live_reactions where live_session_id = existing_session.id;
    delete from public.challenge_live_reaction_totals where live_session_id = existing_session.id;
  end if;

  insert into public.challenge_live_sessions (
    challenge_id,
    youtube_video_id,
    status,
    created_by,
    updated_by,
    started_at,
    ended_at,
    created_at,
    updated_at
  ) values (
    target_challenge_id,
    target_youtube_video_id,
    target_status,
    acting_user,
    acting_user,
    case when target_status = 'Live' then now() else null end,
    null,
    now(),
    now()
  )
  on conflict (challenge_id) do update
  set youtube_video_id = excluded.youtube_video_id,
      status = excluded.status,
      updated_by = acting_user,
      started_at = case
        when excluded.status = 'Live'
             and challenge_live_sessions.status = 'Live'
             and challenge_live_sessions.youtube_video_id = excluded.youtube_video_id
          then challenge_live_sessions.started_at
        when excluded.status = 'Live' then now()
        else null
      end,
      ended_at = null,
      updated_at = now();

  return query
  select * from public.challenge_live_sessions where challenge_id = target_challenge_id;
end;
$$;

create or replace function public.send_challenge_live_reaction(
  target_challenge_id uuid,
  target_reaction text
)
returns table(
  live_session_id uuid,
  challenge_id uuid,
  reaction text,
  reaction_count bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  active_session_id uuid;
begin
  if acting_user is null then
    raise exception 'Log in to react to a live room';
  end if;

  if target_reaction not in ('Fire', 'Applause', 'Wow', 'Strong', 'Love') then
    raise exception 'Invalid live reaction';
  end if;

  select id into active_session_id
  from public.challenge_live_sessions
  where challenge_live_sessions.challenge_id = target_challenge_id
    and status = 'Live';

  if active_session_id is null then
    raise exception 'This room is not live';
  end if;

  -- Serialize reactions from the same viewer in this session so concurrent
  -- requests cannot bypass the one-second limit.
  perform pg_advisory_xact_lock(
    hashtextextended(active_session_id::text || ':' || acting_user::text, 0)
  );

  if exists (
    select 1
    from public.challenge_live_reactions
    where challenge_live_reactions.live_session_id = active_session_id
      and challenge_live_reactions.user_id = acting_user
      and challenge_live_reactions.last_reacted_at > now() - interval '1 second'
  ) then
    raise exception 'Please wait a moment before reacting again';
  end if;

  insert into public.challenge_live_reactions (
    live_session_id,
    challenge_id,
    user_id,
    reaction,
    reaction_count,
    last_reacted_at
  ) values (
    active_session_id,
    target_challenge_id,
    acting_user,
    target_reaction,
    1,
    now()
  )
  on conflict (live_session_id, user_id, reaction) do update
  set reaction_count = challenge_live_reactions.reaction_count + 1,
      last_reacted_at = now();

  insert into public.challenge_live_reaction_totals (
    live_session_id,
    challenge_id,
    reaction,
    reaction_count,
    updated_at
  ) values (
    active_session_id,
    target_challenge_id,
    target_reaction,
    1,
    now()
  )
  on conflict (live_session_id, reaction) do update
  set reaction_count = challenge_live_reaction_totals.reaction_count + 1,
      updated_at = now();

  return query
  select
    totals.live_session_id,
    totals.challenge_id,
    totals.reaction,
    totals.reaction_count,
    totals.updated_at
  from public.challenge_live_reaction_totals totals
  where totals.live_session_id = active_session_id
    and totals.reaction = target_reaction;
end;
$$;

create or replace function public.end_challenge_live_when_completed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    update public.challenge_live_sessions
    set status = 'Ended',
        started_at = coalesce(started_at, now()),
        ended_at = now(),
        updated_at = now()
    where challenge_id = new.id
      and status in ('Ready', 'Live');
  end if;

  return new;
end;
$$;

drop trigger if exists end_challenge_live_on_completion on public.challenges;
create trigger end_challenge_live_on_completion
after update of status on public.challenges
for each row execute function public.end_challenge_live_when_completed();

revoke all on function public.can_manage_challenge_live(uuid, uuid) from public;
revoke all on function public.set_challenge_live_session(uuid, text, text) from public;
revoke all on function public.send_challenge_live_reaction(uuid, text) from public;
revoke all on function public.end_challenge_live_when_completed() from public;

grant execute on function public.can_manage_challenge_live(uuid, uuid) to authenticated;
grant execute on function public.set_challenge_live_session(uuid, text, text) to authenticated;
grant execute on function public.send_challenge_live_reaction(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_live_sessions'
  ) then
    alter publication supabase_realtime add table public.challenge_live_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_live_reaction_totals'
  ) then
    alter publication supabase_realtime add table public.challenge_live_reaction_totals;
  end if;
end;
$$;

comment on table public.challenge_live_sessions is
  'Organizer-controlled YouTube broadcasts embedded in Talent7 challenge rooms.';

comment on table public.challenge_live_reactions is
  'Private bounded per-user reaction counters used for rate limiting and aggregation.';

comment on table public.challenge_live_reaction_totals is
  'Public aggregate reaction totals for realtime room updates without exposing viewer identities.';
