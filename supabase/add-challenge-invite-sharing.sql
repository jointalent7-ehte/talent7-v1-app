begin;

alter table public.challenge_invites
add column if not exists share_token uuid;

update public.challenge_invites
set share_token = gen_random_uuid()
where share_token is null;

alter table public.challenge_invites
alter column share_token set default gen_random_uuid();

alter table public.challenge_invites
alter column share_token set not null;

create unique index if not exists challenge_invites_share_token_unique
on public.challenge_invites (share_token);

create or replace function public.get_challenge_invite_preview(target_share_token uuid)
returns table (
  invite_status text,
  expires_at timestamptz,
  challenge_title text,
  challenge_lane text,
  sport_type text,
  match_format text,
  roster_size integer,
  booking_region text,
  challenger_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when invite.status = 'Pending' and invite.expires_at <= now() then 'Expired'
      else invite.status
    end as invite_status,
    invite.expires_at,
    challenge.title as challenge_title,
    challenge.lane as challenge_lane,
    challenge.sport_type,
    challenge.match_format,
    challenge.roster_size,
    challenge.booking_region,
    coalesce(nullif(challenger.display_name, ''), 'A Talent7 challenger') as challenger_name,
    invite.created_at
  from public.challenge_invites invite
  join public.challenges challenge on challenge.id = invite.challenge_id
  left join public.profiles challenger on challenger.user_id = invite.from_user_id
  where invite.share_token = target_share_token
  limit 1;
$$;

revoke all on function public.get_challenge_invite_preview(uuid) from public;
grant execute on function public.get_challenge_invite_preview(uuid) to anon, authenticated;

commit;
