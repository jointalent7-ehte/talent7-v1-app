create extension if not exists "uuid-ossp";

create table if not exists public.talent_teams (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  team_type text not null check (team_type in ('Sports team', 'Dance crew', 'Gaming clan', 'Fitness group')),
  main_activity text not null,
  region text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_join_requests (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.talent_teams(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  message text,
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (team_id, requester_user_id)
);

alter table public.talent_teams enable row level security;
alter table public.team_join_requests enable row level security;

drop policy if exists "Public can read teams" on public.talent_teams;
drop policy if exists "Users can create own teams" on public.talent_teams;

create policy "Public can read teams"
on public.talent_teams for select
using (true);

create policy "Users can create own teams"
on public.talent_teams for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists "Users can request to join teams" on public.team_join_requests;
drop policy if exists "Requesters and team owners can read team requests" on public.team_join_requests;
drop policy if exists "Team owners can update team requests" on public.team_join_requests;

create policy "Users can request to join teams"
on public.team_join_requests for insert
to authenticated
with check (auth.uid() = requester_user_id);

create policy "Requesters and team owners can read team requests"
on public.team_join_requests for select
to authenticated
using (
  auth.uid() = requester_user_id
  or exists (
    select 1
    from public.talent_teams
    where talent_teams.id = team_join_requests.team_id
      and talent_teams.owner_user_id = auth.uid()
  )
);

create policy "Team owners can update team requests"
on public.team_join_requests for update
to authenticated
using (
  exists (
    select 1
    from public.talent_teams
    where talent_teams.id = team_join_requests.team_id
      and talent_teams.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.talent_teams
    where talent_teams.id = team_join_requests.team_id
      and talent_teams.owner_user_id = auth.uid()
  )
);
