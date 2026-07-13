alter table public.expert_profiles
add column if not exists service_mode text not null default 'Free help' check (
  service_mode in ('Free help', 'Paid consultation', 'Both')
),
add column if not exists price_range text,
add column if not exists availability_status text not null default 'Accepting requests' check (
  availability_status in ('Accepting requests', 'Busy', 'Unavailable')
);
