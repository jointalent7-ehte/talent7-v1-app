-- Privacy-safe readiness signal for a future distance-based discovery pilot.
-- This does not collect coordinates, device location, or precise GPS and does not enable radius matching.
-- Run after add-protected-reviewer-xp.sql.

begin;

create or replace function public.get_my_talent7_city_discovery_readiness(
  target_activity text default null
)
returns table (
  city_label text,
  activity text,
  readiness_status text,
  active_member_band text,
  readiness_threshold integer,
  pilot_ready boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_city text;
  acting_country text;
  normalized_activity text := nullif(btrim(coalesce(target_activity, '')), '');
  active_members integer := 0;
  threshold_count constant integer := 25;
begin
  if acting_user is null then raise exception 'Log in to check local discovery readiness'; end if;
  if char_length(coalesce(normalized_activity, '')) > 100 then raise exception 'Choose a valid activity'; end if;

  select nullif(btrim(profile.leaderboard_city), ''),
         nullif(btrim(profile.leaderboard_country), '')
  into acting_city, acting_country
  from public.profiles profile
  where profile.user_id = acting_user;

  if acting_city is null or acting_country is null then
    return query select
      null::text,
      normalized_activity,
      'Add city'::text,
      'Unavailable'::text,
      threshold_count,
      false;
    return;
  end if;

  select count(distinct request.user_id)::integer
  into active_members
  from public.talent7_match_requests request
  where request.status in ('Waiting', 'Matched')
    and request.expires_at > now()
    and lower(btrim(request.city_name)) = lower(acting_city)
    and lower(btrim(request.country_name)) = lower(acting_country)
    and (
      normalized_activity is null
      or lower(btrim(request.activity)) = lower(normalized_activity)
    );

  return query select
    concat_ws(' · ', acting_city, acting_country),
    normalized_activity,
    case
      when active_members >= threshold_count then 'Pilot ready'
      when active_members >= 10 then 'Growing'
      else 'Building'
    end,
    case
      when active_members >= threshold_count then '25+'
      when active_members >= 20 then '20–24'
      when active_members >= 15 then '15–19'
      when active_members >= 10 then '10–14'
      when active_members >= 5 then '5–9'
      else 'Fewer than 5'
    end,
    threshold_count,
    active_members >= threshold_count;
end;
$$;

revoke all on function public.get_my_talent7_city_discovery_readiness(text) from public, anon;
grant execute on function public.get_my_talent7_city_discovery_readiness(text) to authenticated;

comment on function public.get_my_talent7_city_discovery_readiness(text) is
  'Returns only a coarse activity-specific density band for the signed-in member city. It prevents arbitrary city probing, exposes no member identities, collects no coordinates, and does not enable distance matching.';

commit;
