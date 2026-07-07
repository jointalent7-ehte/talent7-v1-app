alter table public.challenges
add column if not exists winner text,
add column if not exists final_score text,
add column if not exists completed_at timestamptz;

drop policy if exists "Public can update challenge results during MVP" on public.challenges;

create policy "Public can update challenge results during MVP"
on public.challenges for update
using (true)
with check (true);
