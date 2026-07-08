alter table public.challenges
add column if not exists venue_name text,
add column if not exists booking_url text;
