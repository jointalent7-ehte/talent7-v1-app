-- Keep challenge invitation status synchronized across signed-in devices.
-- Safe to run more than once in the Supabase SQL Editor.

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_invites'
  ) then
    alter publication supabase_realtime add table public.challenge_invites;
  end if;
end
$$;
