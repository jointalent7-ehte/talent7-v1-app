-- Local Talent7 League leaderboards. Run after add-talent7-league-rewards.sql.
-- Exact device location is never collected: members type the area, city, and country they want to represent.

alter table public.profiles
  add column if not exists leaderboard_area text,
  add column if not exists leaderboard_city text,
  add column if not exists leaderboard_country text,
  add column if not exists local_leaderboard_visible boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_leaderboard_area_check,
  drop constraint if exists profiles_leaderboard_city_check,
  drop constraint if exists profiles_leaderboard_country_check;

alter table public.profiles
  add constraint profiles_leaderboard_area_check
    check (leaderboard_area is null or char_length(trim(leaderboard_area)) between 2 and 80),
  add constraint profiles_leaderboard_city_check
    check (leaderboard_city is null or char_length(trim(leaderboard_city)) between 2 and 80),
  add constraint profiles_leaderboard_country_check
    check (leaderboard_country is null or char_length(trim(leaderboard_country)) between 2 and 80);

create index if not exists profiles_local_leaderboard_area_idx
on public.profiles (lower(leaderboard_area), lower(leaderboard_city), lower(leaderboard_country))
where local_leaderboard_visible;

create index if not exists profiles_local_leaderboard_city_idx
on public.profiles (lower(leaderboard_city), lower(leaderboard_country))
where local_leaderboard_visible;

create or replace function public.get_talent7_local_leaderboard(
  target_scope text default 'City',
  target_location text default null,
  target_activity text default null,
  result_limit integer default 20
)
returns table (
  rank_position bigint,
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  main_interest text,
  location_label text,
  rank_points integer,
  xp integer,
  tier text,
  wins integer,
  completed_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  normalized_scope text := initcap(lower(trim(coalesce(target_scope, 'City'))));
  normalized_location text := lower(trim(coalesce(target_location, '')));
  normalized_activity text := lower(trim(coalesce(target_activity, '')));
  active_season_id uuid;
  viewer_city text := '';
  viewer_country text := '';
begin
  if acting_user is null then
    raise exception 'Log in before viewing Talent7 leaderboards';
  end if;

  if normalized_scope not in ('Area', 'City', 'Country', 'Global') then
    raise exception 'Leaderboard scope must be Area, City, Country, or Global';
  end if;

  if normalized_scope <> 'Global' and normalized_location = '' then
    return;
  end if;

  select
    lower(trim(coalesce(profile.leaderboard_city, ''))),
    lower(trim(coalesce(profile.leaderboard_country, '')))
  into viewer_city, viewer_country
  from public.profiles profile
  where profile.user_id = acting_user;

  select season.id
  into active_season_id
  from public.talent7_seasons season
  where season.status = 'Active'
  order by season.starts_at desc
  limit 1;

  if active_season_id is null then
    return;
  end if;

  return query
  with rank_source as (
    select
      rank.user_id,
      rank.rank_points,
      rank.xp,
      rank.tier,
      rank.wins,
      rank.completed_count
    from public.talent7_rank_profiles rank
    where rank.season_id = active_season_id
      and normalized_activity = ''

    union all

    select
      rank.user_id,
      rank.rank_points,
      rank.xp,
      rank.tier,
      rank.wins,
      rank.completed_count
    from public.talent7_activity_ranks rank
    where rank.season_id = active_season_id
      and normalized_activity <> ''
      and lower(trim(rank.activity)) = normalized_activity
  ),
  eligible as (
    select
      source.user_id,
      profile.display_name,
      profile.username,
      profile.avatar_url,
      profile.main_interest,
      case normalized_scope
        when 'Area' then concat_ws(' · ', profile.leaderboard_area, profile.leaderboard_city)
        when 'City' then concat_ws(' · ', profile.leaderboard_city, profile.leaderboard_country)
        when 'Country' then profile.leaderboard_country
        else concat_ws(' · ', profile.leaderboard_city, profile.leaderboard_country)
      end as location_label,
      source.rank_points,
      source.xp,
      source.tier,
      source.wins,
      source.completed_count
    from rank_source source
    join public.profiles profile on profile.user_id = source.user_id
    where profile.local_leaderboard_visible
      and profile.leaderboard_city is not null
      and profile.leaderboard_country is not null
      and (
        normalized_scope = 'Global'
        or (normalized_scope = 'Country' and lower(trim(profile.leaderboard_country)) = normalized_location)
        or (
          normalized_scope = 'City'
          and lower(trim(profile.leaderboard_city)) = normalized_location
          and (viewer_country = '' or lower(trim(profile.leaderboard_country)) = viewer_country)
        )
        or (
          normalized_scope = 'Area'
          and profile.leaderboard_area is not null
          and lower(trim(profile.leaderboard_area)) = normalized_location
          and (viewer_city = '' or lower(trim(profile.leaderboard_city)) = viewer_city)
          and (viewer_country = '' or lower(trim(profile.leaderboard_country)) = viewer_country)
        )
      )
  )
  select
    row_number() over (
      order by eligible.rank_points desc, eligible.wins desc, eligible.completed_count desc, eligible.display_name
    ) as rank_position,
    eligible.user_id,
    eligible.display_name,
    eligible.username,
    eligible.avatar_url,
    eligible.main_interest,
    eligible.location_label,
    eligible.rank_points,
    eligible.xp,
    eligible.tier,
    eligible.wins,
    eligible.completed_count
  from eligible
  order by eligible.rank_points desc, eligible.wins desc, eligible.completed_count desc, eligible.display_name
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
end;
$$;

revoke all on function public.get_talent7_local_leaderboard(text, text, text, integer) from public;
grant execute on function public.get_talent7_local_leaderboard(text, text, text, integer) to authenticated;
