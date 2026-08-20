create table if not exists public.user_notification_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 240),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists user_notification_dismissals_recent_idx
on public.user_notification_dismissals (user_id, dismissed_at desc);

alter table public.user_notification_dismissals enable row level security;

drop policy if exists "Users can read own notification dismissals" on public.user_notification_dismissals;
drop policy if exists "Users can save own notification dismissals" on public.user_notification_dismissals;
drop policy if exists "Users can undo own notification dismissals" on public.user_notification_dismissals;

create policy "Users can read own notification dismissals"
on public.user_notification_dismissals for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can save own notification dismissals"
on public.user_notification_dismissals for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can undo own notification dismissals"
on public.user_notification_dismissals for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.user_notification_dismissals to authenticated;
