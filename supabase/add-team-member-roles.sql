alter table public.team_join_requests
add column if not exists member_role text not null default 'Player';

update public.team_join_requests
set member_role = 'Player'
where member_role is null;
