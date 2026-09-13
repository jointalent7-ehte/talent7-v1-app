-- Consent-based clubs, private scouting shortlists, and role invitations.
-- Run after add-profile-passport-studio.sql and add-push-notifications.sql.

create extension if not exists "uuid-ossp";

begin;

alter table public.profiles
add column if not exists scouting_open boolean not null default false,
add column if not exists scouting_note text not null default '';

alter table public.profiles
drop constraint if exists profiles_scouting_note_check;

alter table public.profiles
add constraint profiles_scouting_note_check check (char_length(scouting_note) <= 180) not valid;

alter table public.profiles validate constraint profiles_scouting_note_check;

create table if not exists public.talent_clubs (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  club_type text not null check (club_type in ('Sports club', 'Talent collective', 'Esports organization', 'Community club')),
  main_activity text not null check (char_length(main_activity) between 2 and 100),
  region text not null check (char_length(region) between 2 and 100),
  description text not null check (char_length(description) between 10 and 500),
  status text not null default 'Active' check (status in ('Active', 'Paused', 'Closed')),
  share_token uuid not null default uuid_generate_v4() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent_club_members (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid not null references public.talent_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  role text not null check (role in ('Owner', 'Manager', 'Scout', 'Member')),
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create table if not exists public.talent_club_shortlists (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid not null references public.talent_clubs(id) on delete cascade,
  profile_user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, profile_user_id)
);

create table if not exists public.talent_club_invitations (
  id uuid primary key default uuid_generate_v4(),
  club_id uuid not null references public.talent_clubs(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  sent_by uuid not null references auth.users(id) on delete cascade,
  target_name text not null check (char_length(target_name) between 2 and 80),
  proposed_role text not null default 'Member' check (proposed_role in ('Manager', 'Scout', 'Member')),
  message text not null default '' check (char_length(message) <= 300),
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Declined', 'Withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists talent_club_one_pending_invitation_idx
on public.talent_club_invitations (club_id, target_user_id)
where status = 'Pending';

create index if not exists talent_club_members_user_idx on public.talent_club_members (user_id, joined_at desc);
create index if not exists talent_club_shortlists_club_idx on public.talent_club_shortlists (club_id, created_at desc);
create index if not exists talent_club_invitations_target_idx on public.talent_club_invitations (target_user_id, created_at desc);

alter table public.talent_clubs enable row level security;
alter table public.talent_club_members enable row level security;
alter table public.talent_club_shortlists enable row level security;
alter table public.talent_club_invitations enable row level security;

create or replace function public.talent7_club_can_scout(target_club_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.talent_club_members member
    where member.club_id = target_club_id
      and member.user_id = target_user_id
      and member.role in ('Owner', 'Manager', 'Scout')
  );
$$;

revoke all on public.talent_clubs, public.talent_club_members, public.talent_club_shortlists, public.talent_club_invitations from anon, authenticated;
grant select on public.talent_clubs, public.talent_club_members to authenticated;
grant select on public.talent_club_shortlists, public.talent_club_invitations to authenticated;

drop policy if exists "Members read active clubs" on public.talent_clubs;
create policy "Members read active clubs" on public.talent_clubs for select to authenticated using (status <> 'Closed');

drop policy if exists "Members read club rosters" on public.talent_club_members;
create policy "Members read club rosters" on public.talent_club_members for select to authenticated using (true);

drop policy if exists "Officials read club shortlists" on public.talent_club_shortlists;
create policy "Officials read club shortlists" on public.talent_club_shortlists for select to authenticated
using (public.talent7_club_can_scout(club_id, auth.uid()));

drop policy if exists "Participants read club invitations" on public.talent_club_invitations;
create policy "Participants read club invitations" on public.talent_club_invitations for select to authenticated
using (
  target_user_id = auth.uid()
  or sent_by = auth.uid()
  or public.talent7_club_can_scout(club_id, auth.uid())
);

create or replace function public.create_talent7_club(
  target_name text,
  target_club_type text,
  target_activity text,
  target_region text,
  target_description text
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
  if acting_user is null then raise exception 'Log in before creating a club'; end if;
  if char_length(trim(coalesce(target_name, ''))) not between 2 and 80 then raise exception 'Use a club name between 2 and 80 characters'; end if;
  if target_club_type not in ('Sports club', 'Talent collective', 'Esports organization', 'Community club') then raise exception 'Choose a valid club type'; end if;
  if char_length(trim(coalesce(target_activity, ''))) not between 2 and 100 then raise exception 'Choose the club activity'; end if;
  if char_length(trim(coalesce(target_region, ''))) not between 2 and 100 then raise exception 'Add the club region'; end if;
  if char_length(trim(coalesce(target_description, ''))) not between 10 and 500 then raise exception 'Use a description between 10 and 500 characters'; end if;

  select profile.display_name into actor_name from public.profiles profile where profile.user_id = acting_user;
  if actor_name is null then raise exception 'Create your Talent7 profile before creating a club'; end if;

  insert into public.talent_clubs (owner_user_id, name, club_type, main_activity, region, description)
  values (acting_user, trim(target_name), target_club_type, trim(target_activity), trim(target_region), trim(target_description))
  returning id into saved_id;

  insert into public.talent_club_members (club_id, user_id, display_name, role)
  values (saved_id, acting_user, actor_name, 'Owner');

  return saved_id;
end;
$$;

create or replace function public.add_talent7_club_shortlist(target_club_id uuid, target_profile_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  saved_id uuid;
begin
  if acting_user is null or not public.talent7_club_can_scout(target_club_id, acting_user) then raise exception 'Only club officials can manage this shortlist'; end if;
  if not exists (select 1 from public.profiles profile where profile.user_id = target_profile_user_id and profile.scouting_open = true) then raise exception 'This profile is not open to scouting'; end if;
  if exists (select 1 from public.talent_club_members member where member.club_id = target_club_id and member.user_id = target_profile_user_id) then raise exception 'This person is already in the club'; end if;

  insert into public.talent_club_shortlists (club_id, profile_user_id, added_by)
  values (target_club_id, target_profile_user_id, acting_user)
  on conflict (club_id, profile_user_id) do update set added_by = excluded.added_by
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.remove_talent7_club_shortlist(target_club_id uuid, target_profile_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare acting_user uuid := auth.uid();
begin
  if acting_user is null or not public.talent7_club_can_scout(target_club_id, acting_user) then raise exception 'Only club officials can manage this shortlist'; end if;
  delete from public.talent_club_shortlists where club_id = target_club_id and profile_user_id = target_profile_user_id;
  return found;
end;
$$;

create or replace function public.send_talent7_club_invitation(
  target_club_id uuid,
  target_profile_user_id uuid,
  target_role text,
  target_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_profile public.profiles;
  target_club public.talent_clubs;
  saved_id uuid;
begin
  if acting_user is null or not public.talent7_club_can_scout(target_club_id, acting_user) then raise exception 'Only club officials can send invitations'; end if;
  if target_role not in ('Manager', 'Scout', 'Member') then raise exception 'Choose a valid club role'; end if;
  if char_length(coalesce(target_message, '')) > 300 then raise exception 'Keep the invitation message under 300 characters'; end if;

  select * into target_profile from public.profiles where user_id = target_profile_user_id;
  select * into target_club from public.talent_clubs where id = target_club_id and status = 'Active';
  if target_profile.user_id is null or target_profile.scouting_open <> true then raise exception 'This profile is not open to scouting'; end if;
  if target_club.id is null then raise exception 'Club not found or not active'; end if;
  if exists (select 1 from public.talent_club_members member where member.club_id = target_club_id and member.user_id = target_profile_user_id) then raise exception 'This person is already in the club'; end if;

  insert into public.talent_club_invitations (club_id, target_user_id, sent_by, target_name, proposed_role, message)
  values (target_club_id, target_profile_user_id, acting_user, target_profile.display_name, target_role, trim(coalesce(target_message, '')))
  returning id into saved_id;

  perform public.enqueue_push_notification(
    target_profile_user_id,
    acting_user,
    'Social',
    'Club scouting invitation',
    target_club.name || ' invited you to join as ' || target_role || '. Review the invitation before deciding.',
    '#teams',
    'club_invitation',
    saved_id
  );
  return saved_id;
exception
  when unique_violation then raise exception 'A pending invitation already exists for this person and club';
end;
$$;

create or replace function public.respond_talent7_club_invitation(target_invitation_id uuid, accept_invitation boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_invitation public.talent_club_invitations;
  target_club public.talent_clubs;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_invitation from public.talent_club_invitations where id = target_invitation_id for update;
  if target_invitation.id is null or target_invitation.target_user_id <> acting_user then raise exception 'Only the invited person can respond'; end if;
  if target_invitation.status <> 'Pending' then raise exception 'This invitation is no longer pending'; end if;
  select * into target_club from public.talent_clubs where id = target_invitation.club_id and status = 'Active';
  if target_club.id is null then raise exception 'This club is no longer active'; end if;

  update public.talent_club_invitations
  set status = case when accept_invitation then 'Accepted' else 'Declined' end, updated_at = now()
  where id = target_invitation.id;

  if accept_invitation then
    insert into public.talent_club_members (club_id, user_id, display_name, role)
    values (target_invitation.club_id, acting_user, target_invitation.target_name, target_invitation.proposed_role)
    on conflict (club_id, user_id) do nothing;
    delete from public.talent_club_shortlists where club_id = target_invitation.club_id and profile_user_id = acting_user;
  end if;

  perform public.enqueue_push_notification(
    target_invitation.sent_by,
    acting_user,
    'Social',
    case when accept_invitation then 'Club invitation accepted' else 'Club invitation declined' end,
    target_invitation.target_name || case when accept_invitation then ' accepted the invitation to ' else ' declined the invitation to ' end || target_club.name || '.',
    '#teams',
    'club_invitation',
    target_invitation.id
  );
  return true;
end;
$$;

create or replace function public.withdraw_talent7_club_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_invitation public.talent_club_invitations;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_invitation from public.talent_club_invitations where id = target_invitation_id for update;
  if target_invitation.id is null then raise exception 'Invitation not found'; end if;
  if target_invitation.status <> 'Pending' then raise exception 'This invitation is no longer pending'; end if;
  if target_invitation.sent_by <> acting_user and not public.talent7_club_can_scout(target_invitation.club_id, acting_user) then
    raise exception 'Only a club official can withdraw this invitation';
  end if;

  update public.talent_club_invitations set status = 'Withdrawn', updated_at = now() where id = target_invitation.id;
  return true;
end;
$$;

create or replace function public.clear_talent7_scouting_shortlists()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.scouting_open = true and new.scouting_open = false then
    delete from public.talent_club_shortlists where profile_user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_talent7_scouting_shortlists_trigger on public.profiles;
create trigger clear_talent7_scouting_shortlists_trigger
after update of scouting_open on public.profiles
for each row execute function public.clear_talent7_scouting_shortlists();

revoke all on function public.talent7_club_can_scout(uuid, uuid) from public;
revoke all on function public.create_talent7_club(text, text, text, text, text) from public;
revoke all on function public.add_talent7_club_shortlist(uuid, uuid) from public;
revoke all on function public.remove_talent7_club_shortlist(uuid, uuid) from public;
revoke all on function public.send_talent7_club_invitation(uuid, uuid, text, text) from public;
revoke all on function public.respond_talent7_club_invitation(uuid, boolean) from public;
revoke all on function public.withdraw_talent7_club_invitation(uuid) from public;
revoke all on function public.clear_talent7_scouting_shortlists() from public;
grant execute on function public.talent7_club_can_scout(uuid, uuid) to authenticated;
grant execute on function public.create_talent7_club(text, text, text, text, text) to authenticated;
grant execute on function public.add_talent7_club_shortlist(uuid, uuid) to authenticated;
grant execute on function public.remove_talent7_club_shortlist(uuid, uuid) to authenticated;
grant execute on function public.send_talent7_club_invitation(uuid, uuid, text, text) to authenticated;
grant execute on function public.respond_talent7_club_invitation(uuid, boolean) to authenticated;
grant execute on function public.withdraw_talent7_club_invitation(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'talent_clubs') then alter publication supabase_realtime add table public.talent_clubs; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'talent_club_members') then alter publication supabase_realtime add table public.talent_club_members; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'talent_club_shortlists') then alter publication supabase_realtime add table public.talent_club_shortlists; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'talent_club_invitations') then alter publication supabase_realtime add table public.talent_club_invitations; end if;
end;
$$;

commit;
