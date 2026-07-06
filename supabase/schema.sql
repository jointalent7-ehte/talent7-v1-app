create extension if not exists "uuid-ossp";

create table if not exists public.challenges (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  lane text not null check (lane in ('Talent battle', 'Sports challenge', 'Mobile gaming challenge')),
  status text not null default 'Open',
  rules text not null,
  team_a text not null,
  team_b text not null,
  proof_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  rating integer not null check (rating between 1 and 7),
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  winner text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.proofs (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  proof_url text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;
alter table public.ratings enable row level security;
alter table public.votes enable row level security;
alter table public.proofs enable row level security;

create policy "Public can read challenges"
on public.challenges for select
using (true);

create policy "Public can create challenges during MVP"
on public.challenges for insert
with check (true);

create policy "Public can read ratings"
on public.ratings for select
using (true);

create policy "Public can create ratings during MVP"
on public.ratings for insert
with check (true);

create policy "Public can read votes"
on public.votes for select
using (true);

create policy "Public can create votes during MVP"
on public.votes for insert
with check (true);

create policy "Public can read proofs"
on public.proofs for select
using (true);

create policy "Public can create proofs during MVP"
on public.proofs for insert
with check (true);

insert into public.challenges (title, lane, team_a, team_b, rules, status)
values
  ('Badminton doubles', 'Sports challenge', 'Rohan + Dev', 'Aryan + Kabir', 'Best of 3 games, 21 points each. Upload victory proof after the match.', 'Open'),
  ('Breakdance battle', 'Talent battle', 'Arya', 'Mateo', '60-second round. Audience rates flow, originality, and energy.', 'Open'),
  ('PUBG squad battle', 'Mobile gaming challenge', 'Nova Squad', 'Open invite', 'Share room code, play match, upload proof clip or screenshot.', 'Open');
