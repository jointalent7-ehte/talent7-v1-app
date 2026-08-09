create extension if not exists "uuid-ossp";

create table if not exists public.challenge_room_views (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  viewer_key text not null,
  user_id uuid references auth.users(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  constraint challenge_room_views_identity_length check (char_length(viewer_key) between 5 and 80),
  constraint challenge_room_views_unique_identity unique (challenge_id, viewer_key)
);

create index if not exists challenge_room_views_recent_idx
on public.challenge_room_views (challenge_id, last_viewed_at desc);

alter table public.challenge_room_views enable row level security;

revoke all on public.challenge_room_views from anon, authenticated;

create or replace function public.record_challenge_room_view(
  target_challenge_id uuid,
  anonymous_viewer_token text default null
)
returns table(room_id uuid, unique_views bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_viewer_key text;
begin
  if not exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
  ) then
    raise exception 'Challenge room not found';
  end if;

  if current_user_id is not null then
    resolved_viewer_key := 'user:' || current_user_id::text;
  else
    if anonymous_viewer_token is null
       or anonymous_viewer_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'A valid anonymous viewer token is required';
    end if;
    resolved_viewer_key := 'anon:' || lower(anonymous_viewer_token);
  end if;

  insert into public.challenge_room_views (
    challenge_id,
    viewer_key,
    user_id,
    first_viewed_at,
    last_viewed_at
  )
  values (
    target_challenge_id,
    resolved_viewer_key,
    current_user_id,
    now(),
    now()
  )
  on conflict (challenge_id, viewer_key)
  do update set last_viewed_at = excluded.last_viewed_at;

  return query
  select target_challenge_id, count(*)
  from public.challenge_room_views
  where challenge_room_views.challenge_id = target_challenge_id;
end;
$$;

create or replace function public.get_challenge_room_view_counts()
returns table(challenge_id uuid, unique_views bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select challenge_room_views.challenge_id, count(*)
  from public.challenge_room_views
  group by challenge_room_views.challenge_id;
$$;

revoke all on function public.record_challenge_room_view(uuid, text) from public;
revoke all on function public.get_challenge_room_view_counts() from public;

grant execute on function public.record_challenge_room_view(uuid, text) to anon, authenticated;
grant execute on function public.get_challenge_room_view_counts() to anon, authenticated;

comment on table public.challenge_room_views is
  'One privacy-safe unique view per signed-in account or random anonymous browser token for each challenge room.';

comment on function public.record_challenge_room_view(uuid, text) is
  'Records a unique room view without collecting an IP address and returns the room aggregate.';
