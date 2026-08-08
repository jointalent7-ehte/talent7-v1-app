create table if not exists public.user_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 240),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists user_notification_reads_recent_idx
on public.user_notification_reads (user_id, read_at desc);

alter table public.user_notification_reads enable row level security;

drop policy if exists "Users can read own notification state" on public.user_notification_reads;
drop policy if exists "Users can save own notification state" on public.user_notification_reads;
drop policy if exists "Users can clear own notification state" on public.user_notification_reads;

create policy "Users can read own notification state"
on public.user_notification_reads for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save own notification state"
on public.user_notification_reads for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can clear own notification state"
on public.user_notification_reads for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.user_notification_reads to authenticated;
