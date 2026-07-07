create extension if not exists "uuid-ossp";

create table if not exists public.coach_offers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  session_type text not null check (session_type in ('Live video', 'Uploaded lessons', 'Both')),
  price_range text not null,
  availability text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coaching_interests (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null references public.coach_offers(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  message text,
  status text not null default 'Interested' check (status in ('Interested', 'Contacted', 'Closed')),
  created_at timestamptz not null default now(),
  unique (offer_id, student_user_id)
);

alter table public.coach_offers enable row level security;
alter table public.coaching_interests enable row level security;

drop policy if exists "Public can read coach offers" on public.coach_offers;
drop policy if exists "Coaches can create own offers" on public.coach_offers;

create policy "Public can read coach offers"
on public.coach_offers for select
using (true);

create policy "Coaches can create own offers"
on public.coach_offers for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can create own coaching interest" on public.coaching_interests;
drop policy if exists "Students and coaches can read coaching interest" on public.coaching_interests;

create policy "Users can create own coaching interest"
on public.coaching_interests for insert
to authenticated
with check (auth.uid() = student_user_id);

create policy "Students and coaches can read coaching interest"
on public.coaching_interests for select
to authenticated
using (
  auth.uid() = student_user_id
  or exists (
    select 1
    from public.coach_offers
    where coach_offers.id = coaching_interests.offer_id
      and coach_offers.user_id = auth.uid()
  )
);
