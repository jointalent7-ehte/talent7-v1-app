begin;

alter table public.challenge_invites
add column if not exists expires_at timestamptz;

update public.challenge_invites
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.challenge_invites
alter column expires_at set default (now() + interval '7 days');

alter table public.challenge_invites
alter column expires_at set not null;

alter table public.challenge_invites
drop constraint if exists challenge_invites_status_check;

alter table public.challenge_invites
add constraint challenge_invites_status_check
check (status in ('Pending', 'Accepted', 'Declined', 'Withdrawn', 'Expired'));

alter table public.challenges
drop constraint if exists challenges_status_check;

alter table public.challenges
add constraint challenges_status_check
check (status in ('Open', 'Completed', 'Cancelled')) not valid;

-- Preserve the strongest, most recent active matchup if older app versions
-- already allowed the same pair to create rooms in both directions.
with active_pair_challenges as (
  select
    least(invite.from_user_id::text, invite.invited_user_id::text) as pair_user_a,
    greatest(invite.from_user_id::text, invite.invited_user_id::text) as pair_user_b,
    invite.challenge_id,
    bool_or(invite.status = 'Accepted') as has_accepted_invite,
    max(coalesce(invite.updated_at, invite.created_at)) as latest_activity
  from public.challenge_invites invite
  join public.challenges challenge on challenge.id = invite.challenge_id
  where challenge.status = 'Open'
    and invite.status in ('Pending', 'Accepted')
    and (invite.status <> 'Pending' or invite.expires_at > now())
  group by
    least(invite.from_user_id::text, invite.invited_user_id::text),
    greatest(invite.from_user_id::text, invite.invited_user_id::text),
    invite.challenge_id
), ranked_pair_challenges as (
  select
    challenge_id,
    row_number() over (
      partition by pair_user_a, pair_user_b
      order by has_accepted_invite desc, latest_activity desc, challenge_id
    ) as pair_rank
  from active_pair_challenges
)
update public.challenges
set status = 'Cancelled'
where id in (
  select challenge_id
  from ranked_pair_challenges
  where pair_rank > 1
);

create or replace function public.sync_challenge_invite_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'Pending' and new.status in ('Declined', 'Withdrawn', 'Expired') then
    update public.challenges
    set status = 'Cancelled'
    where id = new.challenge_id
      and status = 'Open'
      and not exists (
        select 1
        from public.challenge_invites accepted_invite
        where accepted_invite.challenge_id = new.challenge_id
          and accepted_invite.status = 'Accepted'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_challenge_invite_lifecycle_trigger on public.challenge_invites;
create trigger sync_challenge_invite_lifecycle_trigger
after update of status on public.challenge_invites
for each row execute function public.sync_challenge_invite_lifecycle();

create or replace function public.prevent_duplicate_active_challenge_pair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.challenge_invites existing_invite
    join public.challenges existing_challenge on existing_challenge.id = existing_invite.challenge_id
    where (
      (existing_invite.from_user_id = new.from_user_id and existing_invite.invited_user_id = new.invited_user_id)
      or
      (existing_invite.from_user_id = new.invited_user_id and existing_invite.invited_user_id = new.from_user_id)
    )
      and existing_invite.status in ('Pending', 'Accepted')
      and (existing_invite.status <> 'Pending' or existing_invite.expires_at > now())
      and existing_challenge.status = 'Open'
  ) then
    raise exception using
      errcode = '23505',
      message = 'An active challenge invitation already exists between these users.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_challenge_pair_trigger on public.challenge_invites;
create trigger prevent_duplicate_active_challenge_pair_trigger
before insert on public.challenge_invites
for each row execute function public.prevent_duplicate_active_challenge_pair();

drop policy if exists "Invited users can respond to challenge invites" on public.challenge_invites;
drop policy if exists "Senders can withdraw challenge invites" on public.challenge_invites;

create policy "Invited users can respond to challenge invites"
on public.challenge_invites for update
to authenticated
using (
  auth.uid() = invited_user_id
  and status = 'Pending'
  and expires_at > now()
)
with check (
  auth.uid() = invited_user_id
  and status in ('Accepted', 'Declined')
);

create policy "Senders can withdraw challenge invites"
on public.challenge_invites for update
to authenticated
using (
  auth.uid() = from_user_id
  and status = 'Pending'
)
with check (
  auth.uid() = from_user_id
  and status = 'Withdrawn'
);

revoke update on public.challenge_invites from authenticated;
grant update (status, updated_at) on public.challenge_invites to authenticated;

create or replace function public.expire_challenge_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.challenge_invites
  set status = 'Expired', updated_at = now()
  where status = 'Pending'
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_challenge_invites() from public;
grant execute on function public.expire_challenge_invites() to authenticated;

create or replace function public.queue_challenge_invite_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_title text;
begin
  select title into challenge_title from public.challenges where id = new.challenge_id;

  if tg_op = 'INSERT' then
    perform public.enqueue_push_notification(
      new.invited_user_id,
      new.from_user_id,
      'Challenge invite',
      'New challenge invitation',
      'You were invited to ' || coalesce(challenge_title, 'a Talent7 challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status in ('Accepted', 'Declined') and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.from_user_id,
      new.invited_user_id,
      'Challenge update',
      'Challenge invitation ' || lower(new.status),
      new.invited_name || ' ' || lower(new.status) || ' the invitation to ' || coalesce(challenge_title, 'your challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status = 'Withdrawn' and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.invited_user_id,
      new.from_user_id,
      'Challenge update',
      'Challenge invitation withdrawn',
      'The challenger withdrew the invitation to ' || coalesce(challenge_title, 'a Talent7 challenge') || '.',
      '#invites',
      'challenge_invite',
      new.id
    );
  elsif new.status = 'Expired' and new.status is distinct from old.status then
    perform public.enqueue_push_notification(
      new.from_user_id,
      null,
      'Challenge update',
      'Challenge invitation expired',
      'Your invitation to ' || new.invited_name || ' expired before it was accepted.',
      '#invites',
      'challenge_invite',
      new.id
    );
  end if;

  return new;
end;
$$;

update public.challenge_invites
set status = 'Expired', updated_at = now()
where status = 'Pending'
  and expires_at <= now();

commit;
