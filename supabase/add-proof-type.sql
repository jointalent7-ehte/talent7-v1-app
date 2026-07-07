alter table public.proofs
add column if not exists proof_type text not null default 'Video'
check (proof_type in ('Photo', 'Video', 'Screenshot', 'Match link'));
