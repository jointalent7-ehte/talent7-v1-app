-- Apply only after the earlier Talent7 migrations and after taking a database backup.

alter table public.challenges
drop constraint if exists challenges_status_check;

alter table public.challenges
add constraint challenges_status_check
check (status in ('Open', 'Completed', 'Cancelled')) not valid;

drop policy if exists "Challenge creators can update own open challenges" on public.challenges;

create policy "Challenge creators can update own open challenges"
on public.challenges for update
to authenticated
using (auth.uid() = created_by and status <> 'Completed')
with check (auth.uid() = created_by and status <> 'Completed');

drop policy if exists "Authorized users can complete challenges" on public.challenges;

create policy "Authorized users can complete challenges"
on public.challenges for update
to authenticated
using (
  status <> 'Completed'
  and (
    auth.uid() = created_by
    or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
    or exists (
      select 1 from public.talent_teams
      where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
        and talent_teams.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
        and team_join_requests.requester_user_id = auth.uid()
        and team_join_requests.status = 'Accepted'
        and team_join_requests.member_role in ('Captain', 'Organizer')
    )
  )
)
with check (
  status = 'Completed'
  and completed_by = auth.uid()
  and completed_at is not null
  and winner in (team_a, team_b)
  and (
    auth.uid() = created_by
    or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
    or exists (
      select 1 from public.talent_teams
      where talent_teams.id in (challenges.team_a_id, challenges.team_b_id)
        and talent_teams.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.team_join_requests
      where team_join_requests.team_id in (challenges.team_a_id, challenges.team_b_id)
        and team_join_requests.requester_user_id = auth.uid()
        and team_join_requests.status = 'Accepted'
        and team_join_requests.member_role in ('Captain', 'Organizer')
    )
  )
);

create or replace function public.enforce_challenge_update_boundaries()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_admin boolean := false;
begin
  if acting_user is null then
    return new;
  end if;

  select exists (
    select 1 from public.app_admins where app_admins.user_id = acting_user
  ) into acting_admin;

  if acting_admin then
    return new;
  end if;

  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Challenge ownership and creation time cannot be changed';
  end if;

  if old.status = 'Completed' then
    raise exception 'Completed challenges are archived and cannot be changed';
  end if;

  if new.status = 'Completed' then
    if row(
      new.title, new.lane, new.rules, new.team_a, new.team_b,
      new.team_a_id, new.team_b_id, new.proof_url,
      new.venue_name, new.booking_url, new.sport_type, new.booking_region
    ) is distinct from row(
      old.title, old.lane, old.rules, old.team_a, old.team_b,
      old.team_a_id, old.team_b_id, old.proof_url,
      old.venue_name, old.booking_url, old.sport_type, old.booking_region
    ) then
      raise exception 'Challenge details cannot be changed while completing a room';
    end if;
  elsif row(new.winner, new.final_score, new.completed_at, new.completed_by)
        is distinct from row(old.winner, old.final_score, old.completed_at, old.completed_by) then
    raise exception 'Challenge result fields can only be changed during completion';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_challenge_update_boundaries_trigger on public.challenges;
create trigger enforce_challenge_update_boundaries_trigger
before update on public.challenges
for each row execute function public.enforce_challenge_update_boundaries();

with ranked_joins as (
  select id,
         row_number() over (partition by challenge_id, user_id order by created_at asc, id asc) as row_number
  from public.challenge_joins
  where user_id is not null
)
delete from public.challenge_joins
using ranked_joins
where public.challenge_joins.id = ranked_joins.id
  and ranked_joins.row_number > 1;

create unique index if not exists one_join_per_user_per_challenge
on public.challenge_joins (challenge_id, user_id)
where user_id is not null;

drop policy if exists "Signed in can create joins" on public.challenge_joins;
create policy "Signed in can create joins"
on public.challenge_joins for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenges
    where challenges.id = challenge_joins.challenge_id
      and challenges.status <> 'Completed'
  )
);

drop policy if exists "Signed in can create ratings" on public.ratings;
create policy "Signed in can create ratings"
on public.ratings for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenges
    where challenges.id = ratings.challenge_id
      and challenges.status <> 'Completed'
  )
);

drop policy if exists "Signed in can create votes" on public.votes;
create policy "Signed in can create votes"
on public.votes for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenges
    where challenges.id = votes.challenge_id
      and challenges.status <> 'Completed'
      and votes.winner in (challenges.team_a, challenges.team_b)
  )
);

delete from public.challenge_invites where from_user_id = invited_user_id;

alter table public.challenge_invites
drop constraint if exists challenge_invites_not_self;

alter table public.challenge_invites
add constraint challenge_invites_not_self check (from_user_id <> invited_user_id);

drop policy if exists "Users can send challenge invites" on public.challenge_invites;
create policy "Users can send challenge invites"
on public.challenge_invites for insert
to authenticated
with check (
  auth.uid() = from_user_id
  and from_user_id <> invited_user_id
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

revoke update on public.challenge_invites from authenticated;
grant update (status, updated_at) on public.challenge_invites to authenticated;

update public.team_join_requests
set member_role = 'Player'
where member_role not in ('Player', 'Captain', 'Organizer', 'Proof uploader');

alter table public.team_join_requests
drop constraint if exists team_join_requests_member_role_check;

alter table public.team_join_requests
add constraint team_join_requests_member_role_check
check (member_role in ('Player', 'Captain', 'Organizer', 'Proof uploader'));

revoke update on public.team_join_requests from authenticated;
grant update (status, member_role, updated_at) on public.team_join_requests to authenticated;

revoke update on public.coaching_interests from authenticated;
grant update (status) on public.coaching_interests to authenticated;

alter table public.showcase_comments
drop constraint if exists showcase_comments_body_length_check;

alter table public.showcase_comments
add constraint showcase_comments_body_length_check
check (char_length(btrim(body)) between 1 and 500) not valid;

alter table public.profiles
drop constraint if exists profiles_username_format_check;

alter table public.profiles
add constraint profiles_username_format_check
check (username ~ '^[a-z0-9_]{3,30}$') not valid;

alter table public.profiles
drop constraint if exists profiles_display_name_length_check;

alter table public.profiles
add constraint profiles_display_name_length_check
check (char_length(btrim(display_name)) between 2 and 60) not valid;
