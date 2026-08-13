-- Enforce the registered competitor structure for Talent7 athletics events.
-- Individual track, road, jump, and throw events are one athlete per side.
-- Standard relay events are four athletes per side.

create or replace function public.validate_challenge_activity_match_setup()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  activity text := lower(trim(coalesce(new.sport_type, new.title, '')));
  valid_setup boolean := false;
begin
  if activity like '%badminton doubles%' then
    valid_setup := new.match_format = 'Doubles' and new.roster_size = 2;
  elsif activity like '%badminton singles%' then
    valid_setup := new.match_format = 'Singles' and new.roster_size = 1;
  elsif activity like '%volleyball%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 6;
  elsif activity ~ '(football|cricket)' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 11;
  elsif activity like '%basketball%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 5;
  elsif activity like '%pubg squad%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 4;
  elsif activity like '%mech arena%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 5;
  elsif activity like '%relay%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 4;
  elsif activity ~ '(100 m sprint|200 m sprint|400 m sprint|800 m run|1200 m run|1500 m run|3000 m run|5000 m run|10,000 m run|100 m hurdles|110 m hurdles|400 m hurdles|3000 m steeplechase|3 km road race|5 km road race|10 km road race|half marathon|marathon|shot put|javelin throw|discus throw|hammer throw|high jump|long jump|triple jump|pole vault)' then
    valid_setup := new.match_format = 'Singles' and new.roster_size = 1;
  elsif activity like '%team tournament%' then
    valid_setup := new.match_format = 'Team' and new.roster_size between 2 and 50;
  elsif activity ~ '(table tennis|tennis)' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Doubles' and new.roster_size = 2);
  elsif activity ~ '(pubg|gaming)' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Doubles' and new.roster_size = 2)
      or (new.match_format = 'Team' and new.roster_size between 2 and 50);
  elsif activity like '%chess%' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Team' and new.roster_size between 2 and 50);
  elsif activity ~ '(breakdance|dance battle|rap|singing|music performance|art challenge|other talent|swimming|running|athletics|skating|cycling|bouldering|calisthenics|gym / fitness|parkour|yoga|sports coaching)' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Team' and new.roster_size between 2 and 50);
  else
    valid_setup := new.match_format = 'Singles' and new.roster_size = 1;
  end if;

  if not valid_setup then
    raise exception 'The selected match format or roster size is not valid for %', coalesce(new.sport_type, new.title, 'this activity');
  end if;

  return new;
end;
$$;

comment on function public.validate_challenge_activity_match_setup() is
  'Keeps challenge formats and registered roster sizes compatible with the selected Talent7 activity, including individual and relay athletics events.';
