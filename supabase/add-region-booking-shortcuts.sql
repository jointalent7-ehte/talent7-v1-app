alter table public.challenges
add column if not exists sport_type text,
add column if not exists booking_region text;
