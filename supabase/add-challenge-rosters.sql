alter table public.challenges
add column if not exists match_format text,
add column if not exists roster_size integer;

update public.challenges
set match_format = case
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) like '%doubles%' then 'Doubles'
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) like '%singles%' then 'Singles'
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) ~ '(football|cricket|volleyball|basketball|pubg|squad|team|crew)' then 'Team'
      else 'Singles'
    end,
    roster_size = case
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) like '%doubles%' then 2
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) ~ '(football|cricket)' then 11
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) like '%volleyball%' then 6
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) like '%basketball%' then 5
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) ~ '(pubg|squad)' then 4
      when lower(coalesce(title, '') || ' ' || coalesce(sport_type, '')) ~ '(team|crew)' then 2
      else 1
    end
where match_format is null or roster_size is null;

alter table public.challenges
alter column match_format set default 'Singles',
alter column match_format set not null,
alter column roster_size set default 1,
alter column roster_size set not null;

alter table public.challenges
drop constraint if exists challenges_match_format_check,
drop constraint if exists challenges_roster_size_check,
drop constraint if exists challenges_format_roster_size_check;

alter table public.challenges
add constraint challenges_match_format_check
check (match_format in ('Singles', 'Doubles', 'Team')),
add constraint challenges_roster_size_check
check (roster_size between 1 and 50),
add constraint challenges_format_roster_size_check
check (
  (match_format = 'Singles' and roster_size = 1)
  or (match_format = 'Doubles' and roster_size = 2)
  or (match_format = 'Team' and roster_size between 2 and 50)
);

update public.challenge_joins
set side = 'Team B'
where role = 'Challenger' and side = 'Open invite';

update public.challenge_joins
set side = 'Audience'
where role = 'Audience' and side <> 'Audience';

create or replace function public.challenge_roster_is_ready(target_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and (
        select count(*) from public.challenge_joins
        where challenge_joins.challenge_id = challenges.id
          and challenge_joins.role = 'Challenger'
          and challenge_joins.side = 'Team A'
      ) >= challenges.roster_size
      and (
        select count(*) from public.challenge_joins
        where challenge_joins.challenge_id = challenges.id
          and challenge_joins.role = 'Challenger'
          and challenge_joins.side = 'Team B'
      ) >= challenges.roster_size
  );
$$;

create or replace function public.enforce_challenge_join_roster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  required_players integer;
  occupied_players integer;
  saved_name text;
begin
  if new.role = 'Audience' then
    new.side := 'Audience';
  elsif new.role = 'Challenger' then
    if new.side not in ('Team A', 'Team B') then
      raise exception 'Choose Team A or Team B';
    end if;

    select roster_size into required_players
    from public.challenges
    where id = new.challenge_id
    for update;

    if required_players is null then
      raise exception 'Challenge room not found';
    end if;

    select count(*) into occupied_players
    from public.challenge_joins
    where challenge_id = new.challenge_id
      and role = 'Challenger'
      and side = new.side
      and (tg_op = 'INSERT' or id <> new.id);

    if occupied_players >= required_players then
      raise exception '% is full (% registered players)', new.side, required_players;
    end if;
  else
    raise exception 'Choose Challenger or Audience';
  end if;

  if new.user_id is not null then
    select nullif(trim(display_name), '') into saved_name
    from public.profiles
    where user_id = new.user_id;
    new.participant_name := coalesce(saved_name, new.participant_name);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_challenge_join_roster_trigger on public.challenge_joins;
create trigger enforce_challenge_join_roster_trigger
before insert or update of challenge_id, user_id, role, side, participant_name
on public.challenge_joins
for each row execute function public.enforce_challenge_join_roster();

create or replace function public.register_challenge_creator()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  creator_name text;
begin
  if new.created_by is null then
    return new;
  end if;

  select nullif(trim(display_name), '') into creator_name
  from public.profiles
  where user_id = new.created_by;

  insert into public.challenge_joins (
    challenge_id,
    user_id,
    participant_name,
    role,
    side
  ) values (
    new.id,
    new.created_by,
    coalesce(creator_name, 'Room creator'),
    'Challenger',
    'Team A'
  )
  on conflict (challenge_id, user_id) where user_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists register_challenge_creator_trigger on public.challenges;
create trigger register_challenge_creator_trigger
after insert on public.challenges
for each row execute function public.register_challenge_creator();

insert into public.challenge_joins (
  challenge_id,
  user_id,
  participant_name,
  role,
  side
)
select
  challenges.id,
  challenges.created_by,
  coalesce(nullif(trim(profiles.display_name), ''), 'Room creator'),
  'Challenger',
  'Team A'
from public.challenges
left join public.profiles on profiles.user_id = challenges.created_by
where challenges.created_by is not null
  and (
    select count(*) from public.challenge_joins
    where challenge_joins.challenge_id = challenges.id
      and challenge_joins.role = 'Challenger'
      and challenge_joins.side = 'Team A'
  ) < challenges.roster_size
  and not exists (
    select 1 from public.challenge_joins
    where challenge_joins.challenge_id = challenges.id
      and challenge_joins.user_id = challenges.created_by
  )
on conflict (challenge_id, user_id) where user_id is not null do nothing;

create or replace function public.enforce_challenge_roster_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  team_a_players integer;
  team_b_players integer;
begin
  if new.roster_size < 1 then
    raise exception 'Roster size must be at least one';
  end if;

  select
    count(*) filter (where role = 'Challenger' and side = 'Team A'),
    count(*) filter (where role = 'Challenger' and side = 'Team B')
  into team_a_players, team_b_players
  from public.challenge_joins
  where challenge_id = new.id;

  if (new.match_format is distinct from old.match_format or new.roster_size is distinct from old.roster_size)
     and new.status = 'Completed' then
    raise exception 'Match format and roster size cannot change while completing a challenge';
  end if;

  if (new.match_format is distinct from old.match_format or new.roster_size is distinct from old.roster_size)
     and team_a_players + team_b_players > 1 then
    raise exception 'Match format and roster size cannot change after another challenger joins';
  end if;

  if new.roster_size < greatest(team_a_players, team_b_players) then
    raise exception 'Roster size cannot be smaller than the registered players already on a side';
  end if;

  if (
    (new.status = 'Completed' and old.status is distinct from 'Completed')
    or (new.voting_status = 'Open' and old.voting_status is distinct from 'Open')
  ) and (team_a_players < new.roster_size or team_b_players < new.roster_size) then
    raise exception 'Both registered rosters must be full before voting opens or the challenge completes';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_challenge_roster_lifecycle_trigger on public.challenges;
create trigger enforce_challenge_roster_lifecycle_trigger
before update on public.challenges
for each row execute function public.enforce_challenge_roster_lifecycle();

create or replace function public.enforce_live_challenge_roster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'Live'
     and (tg_op = 'INSERT' or old.status is distinct from 'Live')
     and not public.challenge_roster_is_ready(new.challenge_id) then
    raise exception 'Both registered rosters must be full before the room goes live';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.challenge_live_sessions') is not null then
    execute 'drop trigger if exists enforce_live_challenge_roster_trigger on public.challenge_live_sessions';
    execute 'create trigger enforce_live_challenge_roster_trigger before insert or update of status on public.challenge_live_sessions for each row execute function public.enforce_live_challenge_roster()';
  end if;
end;
$$;

revoke all on function public.challenge_roster_is_ready(uuid) from public;
revoke all on function public.enforce_challenge_join_roster() from public;
revoke all on function public.register_challenge_creator() from public;
revoke all on function public.enforce_challenge_roster_lifecycle() from public;
revoke all on function public.enforce_live_challenge_roster() from public;

grant execute on function public.challenge_roster_is_ready(uuid) to anon, authenticated;

comment on column public.challenges.match_format is
  'Singles, Doubles, or Team. This describes the competition structure, not just a typed side label.';

comment on column public.challenges.roster_size is
  'Required number of registered challenger accounts on each side before live, voting, or completion.';
