begin;

alter table public.profiles
add column if not exists share_token uuid;

update public.profiles
set share_token = gen_random_uuid()
where share_token is null;

alter table public.profiles
alter column share_token set default gen_random_uuid();

alter table public.profiles
alter column share_token set not null;

create unique index if not exists profiles_share_token_unique
on public.profiles (share_token);

create or replace function public.get_public_profile_preview(target_share_token uuid)
returns table (
  display_name text,
  username text,
  role text,
  main_interest text,
  region text,
  challenge_availability text,
  challenge_skill_level text,
  challenge_mode text,
  challenge_format text,
  challenge_activities text[],
  follower_count bigint,
  challenge_count bigint,
  completed_count bigint,
  proof_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.display_name,
    profile.username,
    profile.role,
    profile.main_interest,
    profile.region,
    profile.challenge_availability,
    profile.challenge_skill_level,
    profile.challenge_mode,
    profile.challenge_format,
    profile.challenge_activities,
    (select count(*) from public.profile_follows follow where follow.following_id = profile.user_id) as follower_count,
    (
      select count(distinct challenge.id)
      from public.challenges challenge
      left join public.challenge_joins challenge_join
        on challenge_join.challenge_id = challenge.id
        and challenge_join.user_id = profile.user_id
      where challenge.created_by = profile.user_id
        or challenge_join.user_id is not null
    ) as challenge_count,
    (
      select count(distinct challenge.id)
      from public.challenges challenge
      left join public.challenge_joins challenge_join
        on challenge_join.challenge_id = challenge.id
        and challenge_join.user_id = profile.user_id
      where challenge.status = 'Completed'
        and (challenge.created_by = profile.user_id or challenge_join.user_id is not null)
    ) as completed_count,
    (select count(*) from public.proofs proof where proof.user_id = profile.user_id) as proof_count
  from public.profiles profile
  where profile.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_public_profile_preview(uuid) from public;
grant execute on function public.get_public_profile_preview(uuid) to anon, authenticated;

commit;
