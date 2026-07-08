alter table public.challenges
add column if not exists team_a_id uuid references public.talent_teams(id) on delete set null,
add column if not exists team_b_id uuid references public.talent_teams(id) on delete set null;
