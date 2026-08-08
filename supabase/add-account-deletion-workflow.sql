create extension if not exists "uuid-ossp";

-- These early MVP foreign keys were created without delete behaviour. Owned
-- activity should disappear with the account; attribution on completed rooms
-- is historical and is therefore cleared instead.
alter table public.challenges drop constraint if exists challenges_created_by_fkey;
alter table public.challenges
  add constraint challenges_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.challenges drop constraint if exists challenges_completed_by_fkey;
alter table public.challenges
  add constraint challenges_completed_by_fkey
  foreign key (completed_by) references auth.users(id) on delete set null;

alter table public.challenge_joins drop constraint if exists challenge_joins_user_id_fkey;
alter table public.challenge_joins
  add constraint challenge_joins_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.ratings drop constraint if exists ratings_user_id_fkey;
alter table public.ratings
  add constraint ratings_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.votes drop constraint if exists votes_user_id_fkey;
alter table public.votes
  add constraint votes_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.proofs drop constraint if exists proofs_user_id_fkey;
alter table public.proofs
  add constraint proofs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

create table if not exists public.account_deletion_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  account_email text,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'Pending'
    check (status in ('Pending', 'In review', 'Deleting', 'Completed', 'Cancelled', 'Rejected')),
  eligible_after timestamptz not null default (now() + interval '7 days'),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_active_account_deletion_request_per_user
on public.account_deletion_requests (user_id)
where user_id is not null and status in ('Pending', 'In review', 'Deleting');

create index if not exists account_deletion_requests_status_created_idx
on public.account_deletion_requests (status, created_at desc);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users can read own deletion requests" on public.account_deletion_requests;
create policy "Users can read own deletion requests"
on public.account_deletion_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read deletion requests" on public.account_deletion_requests;
create policy "Admins can read deletion requests"
on public.account_deletion_requests for select
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

-- Direct writes are deliberately unavailable. Users request/cancel through
-- these narrow functions; admin transitions happen only in the server route.
revoke insert, update, delete on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

create or replace function public.request_account_deletion(request_reason text default null)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester_id uuid := auth.uid();
  requester_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  existing_request public.account_deletion_requests;
  created_request public.account_deletion_requests;
begin
  if requester_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.app_admins where user_id = requester_id) then
    raise exception 'The owner account cannot be deleted through the public queue';
  end if;

  if char_length(coalesce(request_reason, '')) > 500 then
    raise exception 'Reason must be 500 characters or fewer';
  end if;

  select * into existing_request
  from public.account_deletion_requests
  where user_id = requester_id
    and status in ('Pending', 'In review', 'Deleting')
  order by created_at desc
  limit 1;

  if found then
    return existing_request;
  end if;

  insert into public.account_deletion_requests (user_id, account_email, reason)
  values (requester_id, nullif(requester_email, ''), nullif(trim(request_reason), ''))
  returning * into created_request;

  return created_request;
end;
$$;

create or replace function public.cancel_account_deletion(request_id uuid)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  cancelled_request public.account_deletion_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.account_deletion_requests
  set status = 'Cancelled',
      cancelled_at = now(),
      updated_at = now(),
      last_error = null
  where id = request_id
    and user_id = auth.uid()
    and status in ('Pending', 'In review')
  returning * into cancelled_request;

  if not found then
    raise exception 'This deletion request can no longer be cancelled';
  end if;

  return cancelled_request;
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
revoke all on function public.cancel_account_deletion(uuid) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.cancel_account_deletion(uuid) to authenticated;

