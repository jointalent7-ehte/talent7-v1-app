create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  proof_id uuid references public.proofs(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('Challenge', 'Proof')),
  reason text not null check (reason in ('Spam', 'Fake proof', 'Abuse', 'Wrong category', 'Other')),
  notes text,
  status text not null default 'Open' check (status in ('Open', 'Reviewed', 'Dismissed')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "Users can create reports" on public.reports;
drop policy if exists "Users can read their own reports" on public.reports;

create policy "Users can create reports"
on public.reports for insert
with check (auth.uid() = reporter_id);

create policy "Users can read their own reports"
on public.reports for select
using (auth.uid() = reporter_id);
