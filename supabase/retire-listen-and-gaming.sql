-- Retire Listen and gaming without deleting historical records.
-- Existing retired-category rows remain available to service-role/admin workflows,
-- while new or changed public product data must match the active talent-and-sports scope.

alter table public.challenges
  drop constraint if exists challenges_lane_check;

alter table public.challenges
  add constraint challenges_lane_check
  check (lane in ('Talent battle', 'Sports challenge')) not valid;

alter table public.challenges
  drop constraint if exists challenges_active_product_scope_check;

alter table public.challenges
  add constraint challenges_active_product_scope_check
  check (
    lower(coalesce(title, '') || ' ' || coalesce(sport_type, '') || ' ' || coalesce(rules, ''))
      !~ '(pubg|mech arena|mobile gaming|gaming clan|gaming squad|video game|e-?sports)'
  ) not valid;

alter table public.talent_teams
  drop constraint if exists talent_teams_team_type_check;

alter table public.talent_teams
  add constraint talent_teams_team_type_check
  check (team_type in ('Sports team', 'Dance crew', 'Fitness group')) not valid;

alter table public.talent_teams
  drop constraint if exists talent_teams_active_product_scope_check;

alter table public.talent_teams
  add constraint talent_teams_active_product_scope_check
  check (
    lower(coalesce(name, '') || ' ' || coalesce(main_activity, '') || ' ' || coalesce(description, ''))
      !~ '(pubg|mech arena|mobile gaming|gaming clan|gaming squad|video game|e-?sports)'
  ) not valid;

alter table public.first_wave_interests
  drop constraint if exists first_wave_interests_role_goal_check;

alter table public.first_wave_interests
  add constraint first_wave_interests_role_goal_check
  check (role_goal in ('Challenger', 'Audience', 'Coach', 'Organizer', 'Expert helper')) not valid;

alter table public.profiles
  drop constraint if exists profiles_active_product_scope_check;

alter table public.profiles
  add constraint profiles_active_product_scope_check
  check (
    lower(coalesce(main_interest, '') || ' ' || coalesce(array_to_string(challenge_activities, ' '), ''))
      !~ '(pubg|mech arena|mobile gaming|gaming clan|gaming squad|video game|e-?sports)'
  ) not valid;

drop policy if exists "Anyone can read open listen rooms" on public.listen_rooms;
drop policy if exists "People can access allowed listen rooms" on public.listen_rooms;
drop policy if exists "Users can create listen rooms" on public.listen_rooms;
drop policy if exists "Users can create public listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can update listen rooms" on public.listen_rooms;
drop policy if exists "Hosts can delete listen rooms" on public.listen_rooms;

drop policy if exists "Anyone can read members of open listen rooms" on public.listen_room_members;
drop policy if exists "People can read members of allowed listen rooms" on public.listen_room_members;
drop policy if exists "Users can join open listen rooms" on public.listen_room_members;
drop policy if exists "Users can directly join public listen rooms" on public.listen_room_members;
drop policy if exists "Users can leave listen rooms" on public.listen_room_members;

drop policy if exists "Anyone can read reactions in open listen rooms" on public.listen_room_reactions;
drop policy if exists "People can read reactions in allowed listen rooms" on public.listen_room_reactions;
drop policy if exists "Members can react in listen rooms" on public.listen_room_reactions;
drop policy if exists "Users can remove own listen reactions" on public.listen_room_reactions;

drop policy if exists "Anyone can read tracks in open listen rooms" on public.listen_tracks;
drop policy if exists "People can read tracks in allowed listen rooms" on public.listen_tracks;
drop policy if exists "Members can add listen tracks" on public.listen_tracks;
drop policy if exists "Users and hosts can delete listen tracks" on public.listen_tracks;

revoke all on public.listen_rooms, public.listen_room_members, public.listen_room_reactions, public.listen_tracks
  from anon, authenticated;

revoke execute on function public.is_listen_room_member(uuid) from public, anon, authenticated;
revoke execute on function public.can_access_listen_room(uuid) from public, anon, authenticated;
revoke execute on function public.create_listen_room(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.join_public_listen_room(uuid, text) from public, anon, authenticated;
revoke execute on function public.join_private_listen_room(text, text, text) from public, anon, authenticated;

