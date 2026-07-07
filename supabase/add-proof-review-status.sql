alter table public.proofs
add column if not exists review_status text not null default 'Pending review'
check (review_status in ('Pending review', 'Accepted', 'Rejected'));
