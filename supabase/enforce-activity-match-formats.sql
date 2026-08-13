-- Repair strict-format rooms that are still early enough to change safely. Rooms
-- with an opponent already registered, or completed rooms, are deliberately left
-- unchanged because changing their roster contract would alter an active result.
update public.challenges
set match_format = case
      when lower(trim(coalesce(sport_type, title, ''))) like '%badminton doubles%' then 'Doubles'
      when lower(trim(coalesce(sport_type, title, ''))) like '%badminton singles%' then 'Singles'
      else 'Team'
    end,
    roster_size = case
      when lower(trim(coalesce(sport_type, title, ''))) like '%badminton doubles%' then 2
      when lower(trim(coalesce(sport_type, title, ''))) like '%badminton singles%' then 1
      when lower(trim(coalesce(sport_type, title, ''))) like '%volleyball%' then 6
      when lower(trim(coalesce(sport_type, title, ''))) ~ '(football|cricket)' then 11
      when lower(trim(coalesce(sport_type, title, ''))) like '%basketball%' then 5
      when lower(trim(coalesce(sport_type, title, ''))) like '%pubg squad%' then 4
      when lower(trim(coalesce(sport_type, title, ''))) like '%mech arena%' then 5
      else roster_size
    end
where status <> 'Completed'
  and lower(trim(coalesce(sport_type, title, ''))) ~ '(badminton doubles|badminton singles|volleyball|football|cricket|basketball|pubg squad|mech arena)'
  and (
    select count(*)
    from public.challenge_joins
    where challenge_joins.challenge_id = challenges.id
      and challenge_joins.role = 'Challenger'
  ) <= 1;

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

drop trigger if exists validate_challenge_activity_match_setup_trigger on public.challenges;
create trigger validate_challenge_activity_match_setup_trigger
before insert or update of sport_type, match_format, roster_size on public.challenges
for each row execute function public.validate_challenge_activity_match_setup();

revoke all on function public.validate_challenge_activity_match_setup() from public;

comment on function public.validate_challenge_activity_match_setup() is
  'Keeps challenge formats and registered roster sizes compatible with the selected Talent7 activity.';
