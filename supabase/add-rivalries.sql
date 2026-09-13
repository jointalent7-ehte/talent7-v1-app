-- Consent-based individual rivalries with proof-backed head-to-head records.
-- Run after add-talent7-league-rewards.sql and add-push-notifications.sql.

create extension if not exists "uuid-ossp";

begin;

create table if not exists public.rivalries (
  id uuid primary key default uuid_generate_v4(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  opponent_user_id uuid not null references auth.users(id) on delete cascade,
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requester_name text not null check (char_length(requester_name) between 2 and 80),
  opponent_name text not null check (char_length(opponent_name) between 2 and 80),
  activity text not null check (char_length(activity) between 2 and 100),
  status text not null default 'Pending' check (status in ('Pending', 'Active', 'Declined', 'Ended')),
  share_token uuid not null default uuid_generate_v4() unique,
  accepted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> opponent_user_id),
  check (user_low <> user_high)
);

create unique index if not exists rivalries_one_open_pair_activity_idx
on public.rivalries (user_low, user_high, lower(activity))
where status in ('Pending', 'Active');

create table if not exists public.rivalry_matches (
  id uuid primary key default uuid_generate_v4(),
  rivalry_id uuid not null references public.rivalries(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  winner_user_id uuid not null references auth.users(id) on delete cascade,
  score_label text,
  completed_at timestamptz not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (rivalry_id, challenge_id)
);

create index if not exists rivalry_matches_timeline_idx
on public.rivalry_matches (rivalry_id, completed_at desc);

alter table public.rivalries enable row level security;
alter table public.rivalry_matches enable row level security;

drop policy if exists "Members read visible rivalries" on public.rivalries;
create policy "Members read visible rivalries"
on public.rivalries for select
using (
  status in ('Active', 'Ended')
  or auth.uid() = requester_user_id
  or auth.uid() = opponent_user_id
);

drop policy if exists "Members read visible rivalry matches" on public.rivalry_matches;
create policy "Members read visible rivalry matches"
on public.rivalry_matches for select
using (
  exists (
    select 1 from public.rivalries rivalry
    where rivalry.id = rivalry_matches.rivalry_id
      and (
        rivalry.status in ('Active', 'Ended')
        or auth.uid() = rivalry.requester_user_id
        or auth.uid() = rivalry.opponent_user_id
      )
  )
);

revoke insert, update, delete on public.rivalries from anon, authenticated;
revoke insert, update, delete on public.rivalry_matches from anon, authenticated;
grant select on public.rivalries, public.rivalry_matches to anon, authenticated;

create or replace function public.create_talent7_rivalry(target_opponent_id uuid, target_activity text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  actor_name text;
  target_name text;
  saved_id uuid;
begin
  if acting_user is null then raise exception 'Log in before inviting a rival'; end if;
  if target_opponent_id is null or target_opponent_id = acting_user then raise exception 'Choose another Talent7 member'; end if;
  if char_length(trim(coalesce(target_activity, ''))) not between 2 and 100 then raise exception 'Choose the rivalry activity'; end if;

  select profile.display_name into actor_name from public.profiles profile where profile.user_id = acting_user;
  select profile.display_name into target_name from public.profiles profile where profile.user_id = target_opponent_id;
  if target_name is null then raise exception 'Opponent profile not found'; end if;

  if acting_user::text < target_opponent_id::text then
    low_user := acting_user;
    high_user := target_opponent_id;
  else
    low_user := target_opponent_id;
    high_user := acting_user;
  end if;

  insert into public.rivalries (
    requester_user_id, opponent_user_id, user_low, user_high, requester_name, opponent_name, activity
  ) values (
    acting_user, target_opponent_id, low_user, high_user,
    coalesce(nullif(trim(actor_name), ''), 'Talent7 challenger'), trim(target_name), trim(target_activity)
  ) returning id into saved_id;

  perform public.enqueue_push_notification(
    target_opponent_id,
    acting_user,
    'Challenge update',
    'New rivalry invitation',
    coalesce(nullif(trim(actor_name), ''), 'A Talent7 challenger') || ' invited you to begin a ' || trim(target_activity) || ' rivalry.',
    '#rivalries',
    'rivalry',
    saved_id
  );

  return saved_id;
exception
  when unique_violation then raise exception 'A pending or active rivalry already exists for this pair and activity';
end;
$$;

create or replace function public.respond_talent7_rivalry(target_rivalry_id uuid, accept_invitation boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rivalry public.rivalries;
  next_status text;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_rivalry from public.rivalries where id = target_rivalry_id for update;
  if target_rivalry.id is null or target_rivalry.opponent_user_id <> acting_user then raise exception 'Only the invited opponent can respond'; end if;
  if target_rivalry.status <> 'Pending' then raise exception 'This rivalry invitation is no longer pending'; end if;

  next_status := case when accept_invitation then 'Active' else 'Declined' end;
  update public.rivalries
  set status = next_status,
      accepted_at = case when accept_invitation then now() else null end,
      ended_at = case when accept_invitation then null else now() end,
      updated_at = now()
  where id = target_rivalry.id;

  perform public.enqueue_push_notification(
    target_rivalry.requester_user_id,
    acting_user,
    'Challenge update',
    case when accept_invitation then 'Rivalry accepted' else 'Rivalry declined' end,
    target_rivalry.opponent_name || case when accept_invitation then ' accepted your rivalry invitation.' else ' declined your rivalry invitation.' end,
    '#rivalries',
    'rivalry',
    target_rivalry.id
  );
  return true;
end;
$$;

create or replace function public.end_talent7_rivalry(target_rivalry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rivalry public.rivalries;
  other_user uuid;
  actor_name text;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_rivalry from public.rivalries where id = target_rivalry_id for update;
  if target_rivalry.id is null or acting_user not in (target_rivalry.requester_user_id, target_rivalry.opponent_user_id) then raise exception 'Only a rival can end this rivalry'; end if;
  if target_rivalry.status <> 'Active' then raise exception 'This rivalry is not active'; end if;

  update public.rivalries set status = 'Ended', ended_at = now(), updated_at = now() where id = target_rivalry.id;
  other_user := case when acting_user = target_rivalry.requester_user_id then target_rivalry.opponent_user_id else target_rivalry.requester_user_id end;
  actor_name := case when acting_user = target_rivalry.requester_user_id then target_rivalry.requester_name else target_rivalry.opponent_name end;
  perform public.enqueue_push_notification(
    other_user, acting_user, 'Challenge update', 'Rivalry ended', actor_name || ' ended your shared rivalry.',
    '#rivalries', 'rivalry', target_rivalry.id
  );
  return true;
end;
$$;

create or replace function public.get_talent7_rivalry_eligible_challenges(target_rivalry_id uuid)
returns table (
  eligible_challenge_id uuid,
  challenge_title text,
  final_score text,
  challenge_completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rivalry public.rivalries;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_rivalry from public.rivalries where id = target_rivalry_id;
  if target_rivalry.id is null or acting_user not in (target_rivalry.requester_user_id, target_rivalry.opponent_user_id) then raise exception 'Only the two rivals can attach challenges'; end if;

  return query
  select challenge.id, challenge.title, challenge.final_score, coalesce(challenge.completed_at, challenge.created_at)
  from public.challenges challenge
  where challenge.status = 'Completed'
    and challenge.winner is not null
    and lower(trim(coalesce(nullif(challenge.sport_type, ''), challenge.title))) = lower(trim(target_rivalry.activity))
    and exists (select 1 from public.proofs proof where proof.challenge_id = challenge.id)
    and public.talent7_challenge_side_for_user(challenge.id, target_rivalry.requester_user_id) is not null
    and public.talent7_challenge_side_for_user(challenge.id, target_rivalry.opponent_user_id) is not null
    and public.talent7_challenge_side_for_user(challenge.id, target_rivalry.requester_user_id)
      <> public.talent7_challenge_side_for_user(challenge.id, target_rivalry.opponent_user_id)
    and not exists (
      select 1
      from public.rivalry_matches rivalry_match
      where rivalry_match.rivalry_id = target_rivalry.id
        and rivalry_match.challenge_id = challenge.id
    )
  order by coalesce(challenge.completed_at, challenge.created_at) desc
  limit 30;
end;
$$;

create or replace function public.sync_talent7_rivalry_challenge(target_challenge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_challenge public.challenges;
  target_rivalry public.rivalries;
  requester_side text;
  opponent_side text;
  winner_side text;
  winner_user uuid;
  saved_id uuid;
  inserted_count integer := 0;
begin
  select * into target_challenge from public.challenges where id = target_challenge_id;
  if target_challenge.id is null
     or target_challenge.status <> 'Completed'
     or target_challenge.winner is null
     or not exists (select 1 from public.proofs proof where proof.challenge_id = target_challenge.id) then
    return 0;
  end if;

  winner_side := case
    when target_challenge.winner = target_challenge.team_a then 'Team A'
    when target_challenge.winner = target_challenge.team_b then 'Team B'
    else null
  end;
  if winner_side is null then return 0; end if;

  for target_rivalry in
    select rivalry.*
    from public.rivalries rivalry
    where rivalry.status = 'Active'
      and lower(trim(rivalry.activity)) = lower(trim(coalesce(nullif(target_challenge.sport_type, ''), target_challenge.title)))
  loop
    requester_side := public.talent7_challenge_side_for_user(target_challenge.id, target_rivalry.requester_user_id);
    opponent_side := public.talent7_challenge_side_for_user(target_challenge.id, target_rivalry.opponent_user_id);
    if requester_side is null or opponent_side is null or requester_side = opponent_side then continue; end if;

    winner_user := case
      when winner_side = requester_side then target_rivalry.requester_user_id
      else target_rivalry.opponent_user_id
    end;
    saved_id := null;

    insert into public.rivalry_matches (rivalry_id, challenge_id, winner_user_id, score_label, completed_at, added_by)
    values (
      target_rivalry.id,
      target_challenge.id,
      winner_user,
      target_challenge.final_score,
      coalesce(target_challenge.completed_at, target_challenge.created_at),
      coalesce(acting_user, target_challenge.created_by, target_rivalry.requester_user_id)
    )
    on conflict (rivalry_id, challenge_id) do nothing
    returning id into saved_id;

    if saved_id is not null then
      inserted_count := inserted_count + 1;
      perform public.enqueue_push_notification(
        target_rivalry.requester_user_id,
        acting_user,
        'Proof and result',
        'Rivalry record updated',
        target_challenge.title || ' was added to your ' || target_rivalry.activity || ' rivalry.',
        '#rivalries',
        'rivalry_match',
        saved_id
      );
      perform public.enqueue_push_notification(
        target_rivalry.opponent_user_id,
        acting_user,
        'Proof and result',
        'Rivalry record updated',
        target_challenge.title || ' was added to your ' || target_rivalry.activity || ' rivalry.',
        '#rivalries',
        'rivalry_match',
        saved_id
      );
    end if;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.sync_talent7_rivalry_challenge_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'proofs' then
    perform public.sync_talent7_rivalry_challenge(new.challenge_id);
  else
    perform public.sync_talent7_rivalry_challenge(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_talent7_rivalry_after_result on public.challenges;
create trigger sync_talent7_rivalry_after_result
after update of status, winner, final_score, completed_at on public.challenges
for each row execute function public.sync_talent7_rivalry_challenge_trigger();

drop trigger if exists sync_talent7_rivalry_after_proof on public.proofs;
create trigger sync_talent7_rivalry_after_proof
after insert on public.proofs
for each row execute function public.sync_talent7_rivalry_challenge_trigger();

create or replace function public.attach_talent7_rivalry_challenge(target_rivalry_id uuid, target_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_rivalry public.rivalries;
  target_challenge public.challenges;
  requester_side text;
  opponent_side text;
  winner_side text;
  winner_user uuid;
  saved_id uuid;
  other_user uuid;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_rivalry from public.rivalries where id = target_rivalry_id;
  if target_rivalry.id is null or acting_user not in (target_rivalry.requester_user_id, target_rivalry.opponent_user_id) then raise exception 'Only the two rivals can attach challenges'; end if;
  if target_rivalry.status <> 'Active' then raise exception 'Accept the rivalry before adding results'; end if;

  select * into target_challenge from public.challenges where id = target_challenge_id;
  if target_challenge.id is null or target_challenge.status <> 'Completed' or target_challenge.winner is null then raise exception 'Choose a completed challenge'; end if;
  if lower(trim(coalesce(nullif(target_challenge.sport_type, ''), target_challenge.title))) <> lower(trim(target_rivalry.activity)) then raise exception 'The challenge activity does not match this rivalry'; end if;
  if not exists (select 1 from public.proofs proof where proof.challenge_id = target_challenge.id) then raise exception 'A saved proof is required for rivalry records'; end if;

  requester_side := public.talent7_challenge_side_for_user(target_challenge.id, target_rivalry.requester_user_id);
  opponent_side := public.talent7_challenge_side_for_user(target_challenge.id, target_rivalry.opponent_user_id);
  if requester_side is null or opponent_side is null or requester_side = opponent_side then raise exception 'Both rivals must be registered on opposite sides of this challenge'; end if;
  winner_side := case when target_challenge.winner = target_challenge.team_a then 'Team A' when target_challenge.winner = target_challenge.team_b then 'Team B' else null end;
  if winner_side is null then raise exception 'The saved challenge winner could not be matched to a side'; end if;
  winner_user := case when winner_side = requester_side then target_rivalry.requester_user_id else target_rivalry.opponent_user_id end;

  insert into public.rivalry_matches (rivalry_id, challenge_id, winner_user_id, score_label, completed_at, added_by)
  values (target_rivalry.id, target_challenge.id, winner_user, target_challenge.final_score, coalesce(target_challenge.completed_at, target_challenge.created_at), acting_user)
  returning id into saved_id;

  other_user := case when acting_user = target_rivalry.requester_user_id then target_rivalry.opponent_user_id else target_rivalry.requester_user_id end;
  perform public.enqueue_push_notification(
    other_user, acting_user, 'Proof and result', 'Rivalry record updated',
    target_challenge.title || ' was added to your ' || target_rivalry.activity || ' rivalry.',
    '#rivalries', 'rivalry_match', saved_id
  );
  return saved_id;
exception
  when unique_violation then raise exception 'This challenge is already part of a rivalry record';
end;
$$;

revoke all on function public.create_talent7_rivalry(uuid, text) from public;
revoke all on function public.respond_talent7_rivalry(uuid, boolean) from public;
revoke all on function public.end_talent7_rivalry(uuid) from public;
revoke all on function public.get_talent7_rivalry_eligible_challenges(uuid) from public;
revoke all on function public.sync_talent7_rivalry_challenge(uuid) from public;
revoke all on function public.sync_talent7_rivalry_challenge_trigger() from public;
revoke all on function public.attach_talent7_rivalry_challenge(uuid, uuid) from public;
grant execute on function public.create_talent7_rivalry(uuid, text) to authenticated;
grant execute on function public.respond_talent7_rivalry(uuid, boolean) to authenticated;
grant execute on function public.end_talent7_rivalry(uuid) to authenticated;
grant execute on function public.get_talent7_rivalry_eligible_challenges(uuid) to authenticated;
grant execute on function public.attach_talent7_rivalry_challenge(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rivalries'
  ) then alter publication supabase_realtime add table public.rivalries; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rivalry_matches'
  ) then alter publication supabase_realtime add table public.rivalry_matches; end if;
end;
$$;

commit;
