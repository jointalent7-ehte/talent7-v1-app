-- Public single-elimination tournament brackets connected to Talent7 challenge rooms.
-- Run after add-area-city-leaderboards.sql and add-open-challenge-queues.sql.

begin;

create table if not exists public.tournaments (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  organizer_name text not null check (char_length(organizer_name) between 2 and 80),
  title text not null check (char_length(title) between 3 and 100),
  activity text not null check (char_length(activity) between 2 and 100),
  participant_mode text not null check (participant_mode in ('Individuals', 'Teams')),
  bracket_size integer not null check (bracket_size in (4, 8, 16)),
  status text not null default 'Registration'
    check (status in ('Registration', 'Live', 'Completed', 'Cancelled')),
  registration_closes_at timestamptz,
  starts_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  participant_user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references public.talent_teams(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 100),
  seed integer check (seed between 1 and 16),
  status text not null default 'Registered'
    check (status in ('Registered', 'Withdrawn', 'Eliminated', 'Champion')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((participant_user_id is not null)::integer + (team_id is not null)::integer = 1)
);

create unique index if not exists tournament_entries_active_user_idx
on public.tournament_entries (tournament_id, participant_user_id)
where participant_user_id is not null and status <> 'Withdrawn';

create unique index if not exists tournament_entries_active_team_idx
on public.tournament_entries (tournament_id, team_id)
where team_id is not null and status <> 'Withdrawn';

create unique index if not exists tournament_entries_seed_idx
on public.tournament_entries (tournament_id, seed)
where seed is not null and status <> 'Withdrawn';

create table if not exists public.tournament_matches (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 4),
  match_number integer not null check (match_number between 1 and 8),
  entry_a_id uuid references public.tournament_entries(id) on delete set null,
  entry_b_id uuid references public.tournament_entries(id) on delete set null,
  winner_entry_id uuid references public.tournament_entries(id) on delete set null,
  challenge_id uuid references public.challenges(id) on delete set null,
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot text check (next_slot is null or next_slot in ('A', 'B')),
  status text not null default 'Waiting' check (status in ('Waiting', 'Ready', 'Completed')),
  score_label text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number, match_number),
  unique (challenge_id),
  check (winner_entry_id is null or winner_entry_id = entry_a_id or winner_entry_id = entry_b_id)
);

create index if not exists tournaments_status_created_idx
on public.tournaments (status, created_at desc);

create index if not exists tournament_matches_bracket_idx
on public.tournament_matches (tournament_id, round_number, match_number);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists "Everyone can read tournaments" on public.tournaments;
create policy "Everyone can read tournaments"
on public.tournaments for select using (true);

drop policy if exists "Everyone can read tournament entries" on public.tournament_entries;
create policy "Everyone can read tournament entries"
on public.tournament_entries for select using (true);

drop policy if exists "Everyone can read tournament matches" on public.tournament_matches;
create policy "Everyone can read tournament matches"
on public.tournament_matches for select using (true);

revoke insert, update, delete on public.tournaments from anon, authenticated;
revoke insert, update, delete on public.tournament_entries from anon, authenticated;
revoke insert, update, delete on public.tournament_matches from anon, authenticated;
grant select on public.tournaments, public.tournament_entries, public.tournament_matches to anon, authenticated;

create or replace function public.create_talent7_tournament(
  target_title text,
  target_activity text,
  target_participant_mode text,
  target_bracket_size integer,
  target_registration_closes_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  actor_name text;
  saved_id uuid;
begin
  if acting_user is null then raise exception 'Log in before creating a tournament'; end if;
  if char_length(trim(coalesce(target_title, ''))) not between 3 and 100 then raise exception 'Tournament title must be 3 to 100 characters'; end if;
  if char_length(trim(coalesce(target_activity, ''))) not between 2 and 100 then raise exception 'Choose a tournament activity'; end if;
  if target_participant_mode not in ('Individuals', 'Teams') then raise exception 'Choose Individuals or Teams'; end if;
  if target_bracket_size not in (4, 8, 16) then raise exception 'Bracket size must be 4, 8, or 16'; end if;
  if target_registration_closes_at is not null and target_registration_closes_at <= now() then raise exception 'Registration closing time must be in the future'; end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'Talent7 organizer')
  into actor_name
  from public.profiles profile
  where profile.user_id = acting_user;

  insert into public.tournaments (
    organizer_id, organizer_name, title, activity, participant_mode, bracket_size, registration_closes_at
  ) values (
    acting_user, coalesce(actor_name, 'Talent7 organizer'), trim(target_title), trim(target_activity),
    target_participant_mode, target_bracket_size, target_registration_closes_at
  ) returning id into saved_id;

  return saved_id;
end;
$$;

create or replace function public.join_talent7_tournament(
  target_tournament_id uuid,
  target_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_tournament public.tournaments;
  participant_name text;
  saved_entry_id uuid;
  active_count integer;
begin
  if acting_user is null then raise exception 'Log in before joining a tournament'; end if;
  select * into target_tournament from public.tournaments where id = target_tournament_id for update;
  if target_tournament.id is null then raise exception 'Tournament not found'; end if;
  if target_tournament.status <> 'Registration' then raise exception 'Registration is closed'; end if;
  if target_tournament.registration_closes_at is not null and target_tournament.registration_closes_at <= now() then raise exception 'Registration has closed'; end if;

  select count(*) into active_count
  from public.tournament_entries entry
  where entry.tournament_id = target_tournament.id and entry.status = 'Registered';
  if active_count >= target_tournament.bracket_size then raise exception 'This bracket is full'; end if;

  if target_tournament.participant_mode = 'Teams' then
    if target_team_id is null then raise exception 'Choose a team'; end if;
    if not public.user_can_manage_talent_team(target_team_id, acting_user) then raise exception 'Only a team owner, captain, or organizer can register this team'; end if;
    select team.name into participant_name from public.talent_teams team where team.id = target_team_id;
    if participant_name is null then raise exception 'Team not found'; end if;

    insert into public.tournament_entries (tournament_id, team_id, display_name)
    values (target_tournament.id, target_team_id, participant_name)
    returning id into saved_entry_id;
  else
    if target_team_id is not null then raise exception 'This is an individual tournament'; end if;
    select coalesce(nullif(trim(profile.display_name), ''), 'Talent7 challenger')
    into participant_name from public.profiles profile where profile.user_id = acting_user;

    insert into public.tournament_entries (tournament_id, participant_user_id, display_name)
    values (target_tournament.id, acting_user, coalesce(participant_name, 'Talent7 challenger'))
    returning id into saved_entry_id;
  end if;

  return saved_entry_id;
exception
  when unique_violation then raise exception 'This participant is already registered';
end;
$$;

create or replace function public.withdraw_talent7_tournament_entry(target_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_entry public.tournament_entries;
  target_tournament public.tournaments;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_entry from public.tournament_entries where id = target_entry_id for update;
  select * into target_tournament from public.tournaments where id = target_entry.tournament_id;
  if target_entry.id is null or target_tournament.status <> 'Registration' then raise exception 'This registration can no longer be withdrawn'; end if;
  if target_tournament.organizer_id <> acting_user
    and target_entry.participant_user_id is distinct from acting_user
    and (target_entry.team_id is null or not public.user_can_manage_talent_team(target_entry.team_id, acting_user))
  then raise exception 'You cannot withdraw this entry'; end if;

  update public.tournament_entries set status = 'Withdrawn', seed = null, updated_at = now() where id = target_entry.id;
  return true;
end;
$$;

create or replace function public.start_talent7_tournament(target_tournament_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_tournament public.tournaments;
  entry_count integer;
  total_rounds integer;
  round_index integer;
  match_index integer;
  matches_in_round integer;
  first_entry uuid;
  second_entry uuid;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_tournament from public.tournaments where id = target_tournament_id for update;
  if target_tournament.id is null then raise exception 'Tournament not found'; end if;
  if target_tournament.organizer_id <> acting_user then raise exception 'Only the organizer can start this bracket'; end if;
  if target_tournament.status <> 'Registration' then raise exception 'This bracket has already started'; end if;

  select count(*) into entry_count from public.tournament_entries entry
  where entry.tournament_id = target_tournament.id and entry.status = 'Registered';
  if entry_count <> target_tournament.bracket_size then
    raise exception 'Fill all % bracket slots before starting', target_tournament.bracket_size;
  end if;

  with ordered as (
    select entry.id, row_number() over (order by entry.created_at, entry.id)::integer as assigned_seed
    from public.tournament_entries entry
    where entry.tournament_id = target_tournament.id and entry.status = 'Registered'
  )
  update public.tournament_entries entry
  set seed = ordered.assigned_seed, updated_at = now()
  from ordered where entry.id = ordered.id;

  total_rounds := case target_tournament.bracket_size when 4 then 2 when 8 then 3 else 4 end;

  for round_index in 1..total_rounds loop
    matches_in_round := target_tournament.bracket_size / (2 ^ round_index);
    for match_index in 1..matches_in_round loop
      insert into public.tournament_matches (tournament_id, round_number, match_number)
      values (target_tournament.id, round_index, match_index);
    end loop;
  end loop;

  update public.tournament_matches current_match
  set next_match_id = next_match.id,
      next_slot = case when current_match.match_number % 2 = 1 then 'A' else 'B' end
  from public.tournament_matches next_match
  where current_match.tournament_id = target_tournament.id
    and next_match.tournament_id = current_match.tournament_id
    and next_match.round_number = current_match.round_number + 1
    and next_match.match_number = ((current_match.match_number + 1) / 2)
    and current_match.round_number < total_rounds;

  for match_index in 1..(target_tournament.bracket_size / 2) loop
    select entry.id into first_entry from public.tournament_entries entry
    where entry.tournament_id = target_tournament.id and entry.seed = match_index;
    select entry.id into second_entry from public.tournament_entries entry
    where entry.tournament_id = target_tournament.id and entry.seed = target_tournament.bracket_size - match_index + 1;

    update public.tournament_matches
    set entry_a_id = first_entry, entry_b_id = second_entry, status = 'Ready', updated_at = now()
    where tournament_id = target_tournament.id and round_number = 1 and match_number = match_index;
  end loop;

  update public.tournaments
  set status = 'Live', starts_at = now(), updated_at = now()
  where id = target_tournament.id;
  return true;
end;
$$;

create or replace function public.link_talent7_tournament_match(
  target_match_id uuid,
  target_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_match public.tournament_matches;
  target_tournament public.tournaments;
  target_challenge public.challenges;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_match from public.tournament_matches where id = target_match_id;
  select * into target_tournament from public.tournaments where id = target_match.tournament_id;
  select * into target_challenge from public.challenges where id = target_challenge_id;
  if target_match.id is null or target_tournament.organizer_id <> acting_user then raise exception 'Only the tournament organizer can link matches'; end if;
  if target_match.status = 'Completed' then raise exception 'A completed match cannot be relinked'; end if;
  if target_challenge.id is null or target_challenge.created_by is distinct from acting_user then raise exception 'Choose a challenge room you created'; end if;

  update public.tournament_matches set challenge_id = target_challenge.id, updated_at = now() where id = target_match.id;
  return true;
exception
  when unique_violation then raise exception 'That challenge room is already linked to another tournament match';
end;
$$;

create or replace function public.record_talent7_tournament_match(
  target_match_id uuid,
  target_winner_entry_id uuid,
  target_score_label text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_match public.tournament_matches;
  target_tournament public.tournaments;
  linked_challenge public.challenges;
  losing_entry_id uuid;
  final_round integer;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_match from public.tournament_matches where id = target_match_id for update;
  select * into target_tournament from public.tournaments where id = target_match.tournament_id for update;
  if target_match.id is null or target_tournament.organizer_id <> acting_user then raise exception 'Only the tournament organizer can record this result'; end if;
  if target_match.status <> 'Ready' then raise exception 'Both bracket entries must be ready'; end if;
  if target_winner_entry_id is distinct from target_match.entry_a_id and target_winner_entry_id is distinct from target_match.entry_b_id then raise exception 'Choose one of the two competing entries'; end if;
  if char_length(trim(coalesce(target_score_label, ''))) > 80 then raise exception 'Score must be 80 characters or fewer'; end if;

  if target_match.challenge_id is not null then
    select * into linked_challenge from public.challenges where id = target_match.challenge_id;
    if linked_challenge.status <> 'Completed' then raise exception 'Complete the linked challenge room before advancing a winner'; end if;
  end if;

  losing_entry_id := case when target_winner_entry_id = target_match.entry_a_id then target_match.entry_b_id else target_match.entry_a_id end;
  update public.tournament_matches
  set winner_entry_id = target_winner_entry_id, status = 'Completed', score_label = nullif(trim(target_score_label), ''),
      completed_at = now(), updated_at = now()
  where id = target_match.id;

  update public.tournament_entries set status = 'Eliminated', updated_at = now() where id = losing_entry_id;

  if target_match.next_match_id is not null then
    if target_match.next_slot = 'A' then
      update public.tournament_matches set entry_a_id = target_winner_entry_id, updated_at = now() where id = target_match.next_match_id;
    else
      update public.tournament_matches set entry_b_id = target_winner_entry_id, updated_at = now() where id = target_match.next_match_id;
    end if;
    update public.tournament_matches
    set status = 'Ready', updated_at = now()
    where id = target_match.next_match_id and entry_a_id is not null and entry_b_id is not null;
  else
    update public.tournament_entries set status = 'Champion', updated_at = now() where id = target_winner_entry_id;
    update public.tournaments set status = 'Completed', completed_at = now(), updated_at = now() where id = target_tournament.id;
  end if;

  return true;
end;
$$;

revoke all on function public.create_talent7_tournament(text, text, text, integer, timestamptz) from public;
revoke all on function public.join_talent7_tournament(uuid, uuid) from public;
revoke all on function public.withdraw_talent7_tournament_entry(uuid) from public;
revoke all on function public.start_talent7_tournament(uuid) from public;
revoke all on function public.link_talent7_tournament_match(uuid, uuid) from public;
revoke all on function public.record_talent7_tournament_match(uuid, uuid, text) from public;

grant execute on function public.create_talent7_tournament(text, text, text, integer, timestamptz) to authenticated;
grant execute on function public.join_talent7_tournament(uuid, uuid) to authenticated;
grant execute on function public.withdraw_talent7_tournament_entry(uuid) to authenticated;
grant execute on function public.start_talent7_tournament(uuid) to authenticated;
grant execute on function public.link_talent7_tournament_match(uuid, uuid) to authenticated;
grant execute on function public.record_talent7_tournament_match(uuid, uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournaments'
  ) then
    alter publication supabase_realtime add table public.tournaments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_entries'
  ) then
    alter publication supabase_realtime add table public.tournament_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_matches'
  ) then
    alter publication supabase_realtime add table public.tournament_matches;
  end if;
end;
$$;

commit;
