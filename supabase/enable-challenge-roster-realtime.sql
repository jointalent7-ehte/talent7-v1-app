-- Keep registered challenge rosters synchronized across open devices.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_joins'
  ) then
    alter publication supabase_realtime add table public.challenge_joins;
  end if;
end;
$$;

comment on table public.challenge_joins is
  'Registered challengers and audience members. Published through Supabase Realtime so room rosters stay synchronized.';
