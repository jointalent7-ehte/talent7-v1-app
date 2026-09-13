-- Restore multiplayer gaming as an active Talent7 challenge category.
-- The earlier retirement migration is intentionally kept in history; this
-- migration reverses only its gaming restrictions for existing databases.

alter table public.challenges
  drop constraint if exists challenges_lane_check;

alter table public.challenges
  add constraint challenges_lane_check
  check (lane in ('Talent battle', 'Sports challenge', 'Mobile gaming challenge')) not valid;

alter table public.challenges
  drop constraint if exists challenges_active_product_scope_check;

alter table public.talent_teams
  drop constraint if exists talent_teams_team_type_check;

alter table public.talent_teams
  add constraint talent_teams_team_type_check
  check (team_type in ('Sports team', 'Dance crew', 'Gaming clan', 'Fitness group')) not valid;

alter table public.talent_teams
  drop constraint if exists talent_teams_active_product_scope_check;

alter table public.profiles
  drop constraint if exists profiles_active_product_scope_check;

alter table public.first_wave_interests
  drop constraint if exists first_wave_interests_role_goal_check;

alter table public.first_wave_interests
  add constraint first_wave_interests_role_goal_check
  check (role_goal in ('Challenger', 'Audience', 'Coach', 'Organizer', 'Expert helper', 'Gaming squad')) not valid;

-- Keep the browser's game-specific formats and server validation aligned.
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
  elsif activity ~ '(pubg|bgmi|free fire|fortnite)' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 4;
  elsif activity ~ '(mech arena|call of duty|mobile legends|league of legends|valorant|counter-strike)' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 5;
  elsif activity ~ '(rocket league|brawl stars)' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 3;
  elsif activity ~ '(clash royale|efootball|ea sports fc)' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Doubles' and new.roster_size = 2);
  elsif activity ~ '(minecraft|roblox|among us|multiplayer game|gaming)' then
    valid_setup := new.match_format = 'Team' and new.roster_size between 2 and 50;
  elsif activity like '%volleyball%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 6;
  elsif activity ~ '(football|cricket)' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 11;
  elsif activity like '%basketball%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 5;
  elsif activity like '%relay%' then
    valid_setup := new.match_format = 'Team' and new.roster_size = 4;
  elsif activity like '%team tournament%' then
    valid_setup := new.match_format = 'Team' and new.roster_size between 2 and 50;
  elsif activity ~ '(table tennis|tennis)' then
    valid_setup := (new.match_format = 'Singles' and new.roster_size = 1)
      or (new.match_format = 'Doubles' and new.roster_size = 2);
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
