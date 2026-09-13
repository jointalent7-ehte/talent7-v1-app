begin;

alter table public.profiles
add column if not exists avatar_url text,
add column if not exists headline text not null default '',
add column if not exists bio text not null default '',
add column if not exists passport_theme text not null default 'Aurora',
add column if not exists passport_featured_activities text[] not null default '{}'::text[],
add column if not exists passport_show_avatar boolean not null default true,
add column if not exists passport_show_bio boolean not null default true,
add column if not exists passport_show_region boolean not null default true,
add column if not exists passport_show_activities boolean not null default true;

alter table public.profiles
drop constraint if exists profiles_avatar_url_check,
drop constraint if exists profiles_headline_length_check,
drop constraint if exists profiles_bio_length_check,
drop constraint if exists profiles_passport_theme_check,
drop constraint if exists profiles_passport_featured_activities_check;

alter table public.profiles
add constraint profiles_avatar_url_check check (
  avatar_url is null
  or (
    char_length(avatar_url) <= 2048
    and avatar_url ~ '^https://'
  )
) not valid,
add constraint profiles_headline_length_check check (char_length(headline) <= 90) not valid,
add constraint profiles_bio_length_check check (char_length(bio) <= 360) not valid,
add constraint profiles_passport_theme_check check (passport_theme in ('Aurora', 'Midnight', 'Victory gold')) not valid,
add constraint profiles_passport_featured_activities_check check (cardinality(passport_featured_activities) <= 3) not valid;

-- Supabase Storage is used only when R2 is not configured. Users may remove
-- files from their own dedicated profile-avatar folder, never another user's.
drop policy if exists "Users can delete their own profile images" on storage.objects;
create policy "Users can delete their own profile images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'showcase-media'
  and auth.uid()::text = (storage.foldername(name))[1]
  and (storage.foldername(name))[2] = 'profile-avatar'
);

drop function if exists public.get_public_profile_preview(uuid);

create function public.get_public_profile_preview(target_share_token uuid)
returns table (
  display_name text,
  username text,
  role text,
  main_interest text,
  region text,
  avatar_url text,
  headline text,
  bio text,
  passport_theme text,
  passport_featured_activities text[],
  passport_show_avatar boolean,
  passport_show_bio boolean,
  passport_show_region boolean,
  passport_show_activities boolean,
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
set search_path = public, pg_temp
as $$
  select
    profile.display_name,
    profile.username,
    profile.role,
    profile.main_interest,
    case when profile.passport_show_region then profile.region else '' end,
    case when profile.passport_show_avatar then profile.avatar_url else null end,
    case when profile.passport_show_bio then profile.headline else '' end,
    case when profile.passport_show_bio then profile.bio else '' end,
    profile.passport_theme,
    case when profile.passport_show_activities then profile.passport_featured_activities else '{}'::text[] end,
    profile.passport_show_avatar,
    profile.passport_show_bio,
    profile.passport_show_region,
    profile.passport_show_activities,
    profile.challenge_availability,
    profile.challenge_skill_level,
    profile.challenge_mode,
    profile.challenge_format,
    case when profile.passport_show_activities then profile.challenge_activities else '{}'::text[] end,
    (select count(*) from public.profile_follows follow where follow.following_id = profile.user_id),
    (
      select count(distinct challenge.id)
      from public.challenges challenge
      left join public.challenge_joins challenge_join
        on challenge_join.challenge_id = challenge.id
        and challenge_join.user_id = profile.user_id
      where challenge.created_by = profile.user_id or challenge_join.user_id is not null
    ),
    (
      select count(distinct challenge.id)
      from public.challenges challenge
      left join public.challenge_joins challenge_join
        on challenge_join.challenge_id = challenge.id
        and challenge_join.user_id = profile.user_id
      where challenge.status = 'Completed'
        and (challenge.created_by = profile.user_id or challenge_join.user_id is not null)
    ),
    (select count(*) from public.proofs proof where proof.user_id = profile.user_id)
  from public.profiles profile
  where profile.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_public_profile_preview(uuid) from public;
grant execute on function public.get_public_profile_preview(uuid) to anon, authenticated;

commit;
