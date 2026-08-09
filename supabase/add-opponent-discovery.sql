alter table public.profiles
add column if not exists challenge_availability text not null default 'Open to everyone',
add column if not exists challenge_skill_level text not null default 'Open',
add column if not exists challenge_mode text not null default 'Either',
add column if not exists challenge_format text not null default 'Any',
add column if not exists challenge_activities text[] not null default '{}'::text[],
add column if not exists availability_note text not null default '';

update public.profiles
set challenge_activities = array[main_interest]
where coalesce(cardinality(challenge_activities), 0) = 0
  and char_length(btrim(main_interest)) > 0;

alter table public.profiles
drop constraint if exists profiles_challenge_availability_check,
drop constraint if exists profiles_challenge_skill_level_check,
drop constraint if exists profiles_challenge_mode_check,
drop constraint if exists profiles_challenge_format_check,
drop constraint if exists profiles_challenge_activities_count_check,
drop constraint if exists profiles_availability_note_length_check;

alter table public.profiles
add constraint profiles_challenge_availability_check
  check (challenge_availability in ('Open to everyone', 'People I follow', 'Unavailable')),
add constraint profiles_challenge_skill_level_check
  check (challenge_skill_level in ('Open', 'Beginner', 'Intermediate', 'Advanced', 'Pro')),
add constraint profiles_challenge_mode_check
  check (challenge_mode in ('Either', 'In person', 'Online')),
add constraint profiles_challenge_format_check
  check (challenge_format in ('Any', 'Singles', 'Doubles', 'Team')),
add constraint profiles_challenge_activities_count_check
  check (cardinality(challenge_activities) <= 12),
add constraint profiles_availability_note_length_check
  check (char_length(availability_note) <= 180);

create index if not exists profiles_challenge_availability_idx
on public.profiles (challenge_availability);

create index if not exists profiles_region_lower_idx
on public.profiles (lower(region));

create index if not exists profiles_challenge_activities_idx
on public.profiles using gin (challenge_activities);

create or replace function public.can_send_challenge_invite(target_user_id uuid, sender_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      profiles.challenge_availability = 'Open to everyone'
      or (
        profiles.challenge_availability = 'People I follow'
        and exists (
          select 1
          from public.profile_follows
          where profile_follows.follower_id = target_user_id
            and profile_follows.following_id = sender_user_id
        )
      )
    from public.profiles
    where profiles.user_id = target_user_id
  ), false);
$$;

revoke all on function public.can_send_challenge_invite(uuid, uuid) from public;
grant execute on function public.can_send_challenge_invite(uuid, uuid) to authenticated;

drop policy if exists "Users can send challenge invites" on public.challenge_invites;
create policy "Users can send challenge invites"
on public.challenge_invites for insert
to authenticated
with check (
  auth.uid() = from_user_id
  and from_user_id <> invited_user_id
  and public.can_send_challenge_invite(invited_user_id, auth.uid())
  and exists (
    select 1 from public.challenges
    where challenges.id = challenge_invites.challenge_id
      and challenges.status <> 'Completed'
      and (
        challenges.created_by = auth.uid()
        or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
      )
  )
);
