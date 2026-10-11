-- Member-entered Area, City, Country, and Global discovery for the existing match queue.
-- Run after add-activity-mastery-titles.sql. No device location or precise GPS is collected.

begin;

alter table public.talent7_match_requests
  add column if not exists area_name text,
  add column if not exists city_name text,
  add column if not exists country_name text,
  add column if not exists discovery_scope text not null default 'Global';

alter table public.talent7_match_requests
  drop constraint if exists talent7_match_requests_area_name_check,
  drop constraint if exists talent7_match_requests_city_name_check,
  drop constraint if exists talent7_match_requests_country_name_check,
  drop constraint if exists talent7_match_requests_discovery_scope_check;

alter table public.talent7_match_requests
  add constraint talent7_match_requests_area_name_check
    check (area_name is null or char_length(trim(area_name)) between 2 and 80),
  add constraint talent7_match_requests_city_name_check
    check (city_name is null or char_length(trim(city_name)) between 2 and 80),
  add constraint talent7_match_requests_country_name_check
    check (country_name is null or char_length(trim(country_name)) between 2 and 80),
  add constraint talent7_match_requests_discovery_scope_check
    check (discovery_scope in ('Area', 'City', 'Country', 'Region', 'Global'));

create index if not exists talent7_match_requests_local_discovery_idx
on public.talent7_match_requests (
  lower(country_name), lower(city_name), lower(area_name), activity, created_at
)
where status = 'Waiting';

create or replace function public.join_talent7_match_queue(
  target_activity text,
  target_skill_level text default 'Open',
  target_play_mode text default 'Either',
  target_match_format text default 'Any',
  target_region text default 'Global',
  target_note text default null
)
returns public.talent7_match_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_name text;
  acting_area text;
  acting_city text;
  acting_country text;
  selected_scope text := 'Global';
  saved_request public.talent7_match_requests;
  candidate public.talent7_match_requests;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  target_activity := btrim(coalesce(target_activity, ''));
  target_region := coalesce(nullif(btrim(target_region), ''), 'Global');
  target_note := nullif(btrim(target_note), '');

  if char_length(target_activity) not between 2 and 100 then raise exception 'Choose an activity'; end if;
  if target_skill_level not in ('Open', 'Beginner', 'Intermediate', 'Advanced', 'Pro') then raise exception 'Choose a valid skill level'; end if;
  if target_play_mode not in ('Either', 'In person', 'Online') then raise exception 'Choose a valid play mode'; end if;
  if target_match_format not in ('Any', 'Singles', 'Doubles', 'Team') then raise exception 'Choose a valid match format'; end if;
  if char_length(target_region) > 100 then raise exception 'Keep the region under 100 characters'; end if;
  if char_length(coalesce(target_note, '')) > 180 then raise exception 'Keep the note under 180 characters'; end if;

  select
    coalesce(nullif(btrim(profile.display_name), ''), nullif('@' || btrim(profile.username), ''), 'Talent7 challenger'),
    nullif(btrim(profile.leaderboard_area), ''),
    nullif(btrim(profile.leaderboard_city), ''),
    nullif(btrim(profile.leaderboard_country), '')
  into acting_name, acting_area, acting_city, acting_country
  from public.profiles profile
  where profile.user_id = acting_user;

  if acting_name is null then raise exception 'Complete your Talent7 profile before joining matchmaking'; end if;

  selected_scope := case
    when acting_area is not null and lower(target_region) = lower(acting_area) then 'Area'
    when acting_city is not null and lower(target_region) = lower(acting_city) then 'City'
    when acting_country is not null and lower(target_region) = lower(acting_country) then 'Country'
    when lower(target_region) = 'global' then 'Global'
    else 'Region'
  end;

  update public.talent7_match_requests
  set status = 'Expired', updated_at = now()
  where user_id = acting_user
    and status in ('Waiting', 'Matched')
    and expires_at <= now();

  select * into saved_request
  from public.talent7_match_requests request
  where request.user_id = acting_user
    and lower(request.activity) = lower(target_activity)
    and request.status in ('Waiting', 'Matched')
  order by request.created_at desc
  limit 1
  for update;

  if saved_request.status = 'Matched' then return saved_request; end if;

  if saved_request.id is null then
    insert into public.talent7_match_requests (
      user_id, display_name, activity, skill_level, play_mode, match_format,
      region, note, area_name, city_name, country_name, discovery_scope
    ) values (
      acting_user, acting_name, target_activity, target_skill_level, target_play_mode,
      target_match_format, target_region, target_note, acting_area, acting_city,
      acting_country, selected_scope
    )
    returning * into saved_request;
  else
    update public.talent7_match_requests
    set display_name = acting_name,
        skill_level = target_skill_level,
        play_mode = target_play_mode,
        match_format = target_match_format,
        region = target_region,
        note = target_note,
        area_name = acting_area,
        city_name = acting_city,
        country_name = acting_country,
        discovery_scope = selected_scope,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = saved_request.id
    returning * into saved_request;
  end if;

  select request.* into candidate
  from public.talent7_match_requests request
  where request.id <> saved_request.id
    and request.user_id <> acting_user
    and request.status = 'Waiting'
    and request.expires_at > now()
    and lower(request.activity) = lower(target_activity)
    and (request.play_mode = 'Either' or target_play_mode = 'Either' or request.play_mode = target_play_mode)
    and (request.match_format = 'Any' or target_match_format = 'Any' or request.match_format = target_match_format)
    and (
      saved_request.discovery_scope = 'Global'
      or (saved_request.discovery_scope = 'Region' and lower(request.region) = lower(saved_request.region))
      or (saved_request.discovery_scope = 'Country' and lower(request.country_name) = lower(saved_request.country_name))
      or (
        saved_request.discovery_scope = 'City'
        and lower(request.city_name) = lower(saved_request.city_name)
        and lower(request.country_name) = lower(saved_request.country_name)
      )
      or (
        saved_request.discovery_scope = 'Area'
        and lower(request.area_name) = lower(saved_request.area_name)
        and lower(request.city_name) = lower(saved_request.city_name)
        and lower(request.country_name) = lower(saved_request.country_name)
      )
    )
    and (
      request.discovery_scope = 'Global'
      or (request.discovery_scope = 'Region' and lower(request.region) = lower(saved_request.region))
      or (request.discovery_scope = 'Country' and lower(request.country_name) = lower(saved_request.country_name))
      or (
        request.discovery_scope = 'City'
        and lower(request.city_name) = lower(saved_request.city_name)
        and lower(request.country_name) = lower(saved_request.country_name)
      )
      or (
        request.discovery_scope = 'Area'
        and lower(request.area_name) = lower(saved_request.area_name)
        and lower(request.city_name) = lower(saved_request.city_name)
        and lower(request.country_name) = lower(saved_request.country_name)
      )
    )
  order by
    (
      request.area_name is not null
      and lower(request.area_name) = lower(saved_request.area_name)
      and lower(request.city_name) = lower(saved_request.city_name)
      and lower(request.country_name) = lower(saved_request.country_name)
    ) desc,
    (
      request.city_name is not null
      and lower(request.city_name) = lower(saved_request.city_name)
      and lower(request.country_name) = lower(saved_request.country_name)
    ) desc,
    (request.country_name is not null and lower(request.country_name) = lower(saved_request.country_name)) desc,
    (request.skill_level = target_skill_level) desc,
    request.created_at asc
  limit 1
  for update skip locked;

  if candidate.id is not null then
    update public.talent7_match_requests
    set status = 'Matched', matched_request_id = saved_request.id, updated_at = now()
    where id = candidate.id and status = 'Waiting';

    if found then
      update public.talent7_match_requests
      set status = 'Matched', matched_request_id = candidate.id, updated_at = now()
      where id = saved_request.id
      returning * into saved_request;
    end if;
  end if;

  return saved_request;
end;
$$;

drop function if exists public.get_talent7_match_queue();
create function public.get_talent7_match_queue()
returns table (
  request_id uuid,
  display_name text,
  activity text,
  skill_level text,
  play_mode text,
  match_format text,
  region text,
  note text,
  request_status text,
  created_at timestamptz,
  expires_at timestamptz,
  is_mine boolean,
  matched_user_id uuid,
  matched_display_name text,
  location_scope text,
  location_label text,
  proximity_level text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select
      nullif(lower(btrim(profile.leaderboard_area)), '') as area_name,
      nullif(lower(btrim(profile.leaderboard_city)), '') as city_name,
      nullif(lower(btrim(profile.leaderboard_country)), '') as country_name
    from public.profiles profile
    where profile.user_id = auth.uid()
  )
  select
    request.id,
    request.display_name,
    request.activity,
    request.skill_level,
    request.play_mode,
    request.match_format,
    request.region,
    request.note,
    request.status,
    request.created_at,
    request.expires_at,
    request.user_id = auth.uid(),
    case when request.user_id = auth.uid() then matched.user_id else null end,
    case when request.user_id = auth.uid() then matched.display_name else null end,
    request.discovery_scope,
    case request.discovery_scope
      when 'Area' then concat_ws(' · ', request.area_name, request.city_name)
      when 'City' then concat_ws(' · ', request.city_name, request.country_name)
      when 'Country' then request.country_name
      when 'Region' then request.region
      else 'Global'
    end,
    case
      when viewer.area_name is not null
        and viewer.area_name = lower(request.area_name)
        and viewer.city_name = lower(request.city_name)
        and viewer.country_name = lower(request.country_name) then 'Area'
      when viewer.city_name is not null
        and viewer.city_name = lower(request.city_name)
        and viewer.country_name = lower(request.country_name) then 'City'
      when viewer.country_name is not null
        and viewer.country_name = lower(request.country_name) then 'Country'
      else 'Global'
    end
  from public.talent7_match_requests request
  left join public.talent7_match_requests matched on matched.id = request.matched_request_id
  left join viewer on true
  where request.expires_at > now()
    and (
      request.status = 'Waiting'
      or (request.user_id = auth.uid() and request.status = 'Matched')
    )
  order by
    (request.user_id = auth.uid()) desc,
    case
      when viewer.area_name = lower(request.area_name)
        and viewer.city_name = lower(request.city_name)
        and viewer.country_name = lower(request.country_name) then 4
      when viewer.city_name = lower(request.city_name)
        and viewer.country_name = lower(request.country_name) then 3
      when viewer.country_name = lower(request.country_name) then 2
      else 1
    end desc,
    request.created_at asc;
$$;

revoke all on function public.join_talent7_match_queue(text, text, text, text, text, text) from public;
revoke all on function public.get_talent7_match_queue() from public;
grant execute on function public.join_talent7_match_queue(text, text, text, text, text, text) to authenticated;
grant execute on function public.get_talent7_match_queue() to anon, authenticated;

comment on function public.get_talent7_match_queue() is
  'Returns privacy-safe match requests ordered by member-entered proximity. It exposes only the location scope chosen when joining and never uses precise GPS.';

commit;
