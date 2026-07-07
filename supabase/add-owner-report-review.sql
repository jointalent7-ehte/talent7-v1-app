create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

drop policy if exists "Admins can read own admin record" on public.app_admins;

create policy "Admins can read own admin record"
on public.app_admins for select
to authenticated
using (auth.uid() = user_id);

insert into public.app_admins (user_id, email)
select id, email
from auth.users
where lower(email) = 'jointalent7@gmail.com'
on conflict (user_id) do update
set email = excluded.email;

drop policy if exists "Owners can read all reports" on public.reports;
drop policy if exists "Owners can update report status" on public.reports;

create policy "Owners can read all reports"
on public.reports for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update report status"
on public.reports for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

drop policy if exists "Owners can read all showcase reports" on public.showcase_reports;
drop policy if exists "Owners can update showcase report status" on public.showcase_reports;

create policy "Owners can read all showcase reports"
on public.showcase_reports for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Owners can update showcase report status"
on public.showcase_reports for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);
