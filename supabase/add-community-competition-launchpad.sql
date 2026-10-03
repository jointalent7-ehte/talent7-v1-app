-- Talent7 community competition launchpad.
-- Run after add-cold-start-challenge-network.sql.

begin;

create table if not exists public.talent7_competition_campaigns (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  summary text not null,
  phase text not null default 'Activity vote'
    check (phase in ('Draft', 'Activity vote', 'Day vote', 'Time vote', 'Registration', 'Scheduled', 'Live', 'Review', 'Completed', 'Cancelled')),
  capacity_per_cohort integer not null default 100
    check (capacity_per_cohort between 25 and 500),
  registration_count integer not null default 0 check (registration_count >= 0),
  registration_sequence bigint not null default 0 check (registration_sequence >= 0),
  selected_activity_option_id uuid,
  vote_closes_at timestamptz,
  scheduled_start timestamptz,
  prize_summary text not null,
  eligibility_note text not null,
  review_policy text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(slug) between 2 and 80),
  check (char_length(title) between 3 and 120),
  check (char_length(summary) between 10 and 500)
);

create table if not exists public.talent7_competition_options (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  activity text not null,
  pitch text not null,
  option_kind text not null default 'Community'
    check (option_kind in ('Official', 'Community')),
  moderation_status text not null default 'Pending'
    check (moderation_status in ('Pending', 'Approved', 'Rejected')),
  proposed_by uuid references auth.users(id) on delete set null,
  proposer_name text,
  vote_count integer not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(activity) between 3 and 80),
  check (char_length(pitch) between 10 and 240),
  check (proposer_name is null or char_length(proposer_name) <= 80)
);

create unique index if not exists talent7_competition_options_unique_activity
on public.talent7_competition_options (campaign_id, lower(activity));

create table if not exists public.talent7_competition_activity_votes (
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  option_id uuid not null references public.talent7_competition_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.talent7_competition_schedule_options (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  phase text not null check (phase in ('Day vote', 'Time vote')),
  label text not null,
  proposed_start timestamptz,
  vote_count integer not null default 0 check (vote_count >= 0),
  status text not null default 'Active' check (status in ('Active', 'Closed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (char_length(label) between 2 and 80)
);

create unique index if not exists talent7_competition_schedule_options_unique_label
on public.talent7_competition_schedule_options (campaign_id, phase, lower(label));

create table if not exists public.talent7_competition_schedule_votes (
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  option_id uuid not null references public.talent7_competition_schedule_options(id) on delete cascade,
  phase text not null check (phase in ('Day vote', 'Time vote')),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, phase, user_id)
);

create table if not exists public.talent7_competition_registrations (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.talent7_competition_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  public_anonymous boolean not null default false,
  shipping_region text not null default 'To be confirmed',
  cohort_number integer not null check (cohort_number > 0),
  slot_number integer not null check (slot_number > 0),
  registration_code text not null unique,
  status text not null default 'Interested'
    check (status in ('Interested', 'Confirmed', 'Withdrawn', 'Disqualified', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id),
  check (char_length(display_name) between 1 and 80),
  check (char_length(shipping_region) between 2 and 80)
);

alter table public.talent7_competition_campaigns
  drop constraint if exists talent7_competition_campaigns_selected_activity_option_id_fkey;
alter table public.talent7_competition_campaigns
  add constraint talent7_competition_campaigns_selected_activity_option_id_fkey
  foreign key (selected_activity_option_id)
  references public.talent7_competition_options(id)
  on delete set null;

alter table public.talent7_competition_campaigns enable row level security;
alter table public.talent7_competition_options enable row level security;
alter table public.talent7_competition_activity_votes enable row level security;
alter table public.talent7_competition_schedule_options enable row level security;
alter table public.talent7_competition_schedule_votes enable row level security;
alter table public.talent7_competition_registrations enable row level security;

revoke all on public.talent7_competition_campaigns from anon, authenticated;
revoke all on public.talent7_competition_options from anon, authenticated;
revoke all on public.talent7_competition_activity_votes from anon, authenticated;
revoke all on public.talent7_competition_schedule_options from anon, authenticated;
revoke all on public.talent7_competition_schedule_votes from anon, authenticated;
revoke all on public.talent7_competition_registrations from anon, authenticated;

grant select on public.talent7_competition_campaigns to anon, authenticated;
grant select on public.talent7_competition_options to anon, authenticated;
grant select on public.talent7_competition_schedule_options to anon, authenticated;

drop policy if exists "Everyone reads published competition campaigns" on public.talent7_competition_campaigns;
create policy "Everyone reads published competition campaigns"
on public.talent7_competition_campaigns for select
using (
  phase <> 'Draft'
  or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
);

drop policy if exists "Everyone reads approved competition options" on public.talent7_competition_options;
create policy "Everyone reads approved competition options"
on public.talent7_competition_options for select
using (
  moderation_status = 'Approved'
  or proposed_by = auth.uid()
  or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
);

drop policy if exists "Everyone reads active schedule options" on public.talent7_competition_schedule_options;
create policy "Everyone reads active schedule options"
on public.talent7_competition_schedule_options for select
using (
  status = 'Active'
  or exists (select 1 from public.app_admins where app_admins.user_id = auth.uid())
);

insert into public.talent7_competition_campaigns (
  slug,
  title,
  summary,
  phase,
  capacity_per_cohort,
  vote_closes_at,
  prize_summary,
  eligibility_note,
  review_policy
) values (
  'founding-community-competition',
  'Choose the first Talent7 community competition',
  'The community chooses the activity, then the day and time. Registration remains open as demand grows, with every 100 competitors forming another cohort.',
  'Activity vote',
  100,
  now() + interval '14 days',
  'The final prize and eligible shipping regions will be announced before confirmation. Every eligible finisher can receive a digital certificate.',
  'Interest registration is free. Physical prizes are limited to the published shipping regions; equivalent alternatives may be used where delivery is not practical.',
  'Results remain provisional until the organizer reviews the required proof. Original challenge footage may be retained for the stated review window.'
)
on conflict (slug) do update set
  title = excluded.title,
  summary = excluded.summary,
  capacity_per_cohort = excluded.capacity_per_cohort,
  prize_summary = excluded.prize_summary,
  eligibility_note = excluded.eligibility_note,
  review_policy = excluded.review_policy,
  updated_at = now();

with campaign as (
  select id from public.talent7_competition_campaigns
  where slug = 'founding-community-competition'
)
insert into public.talent7_competition_options (
  campaign_id, activity, pitch, option_kind, moderation_status
)
select campaign.id, seed.activity, seed.pitch, 'Official', 'Approved'
from campaign
cross join (values
  ('60-second push-up challenge', 'A simple one-minute strength event with clear form rules and organizer review.'),
  ('60-second bodyweight squat challenge', 'A highly accessible one-minute endurance event that needs no equipment.'),
  ('Strict plank endurance', 'A controlled hold challenge with a simple clock and a clear legal body position.'),
  ('60-second burpee sprint', 'A fast full-body event built for dramatic live finishes and easy heats.'),
  ('Jump-rope sprint', 'A high-energy coordination event that works well in short recorded or live rounds.')
) as seed(activity, pitch)
on conflict (campaign_id, (lower(activity))) do update set
  pitch = excluded.pitch,
  option_kind = 'Official',
  moderation_status = 'Approved',
  updated_at = now();

create or replace function public.vote_talent7_competition_activity(
  target_campaign_id uuid,
  target_option_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  campaign public.talent7_competition_campaigns;
  previous_option_id uuid;
begin
  if acting_user is null then raise exception 'Log in to vote'; end if;

  select * into campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id
  for update;

  if campaign.id is null or campaign.phase <> 'Activity vote' then
    raise exception 'Activity voting is not open';
  end if;
  if campaign.vote_closes_at is not null and campaign.vote_closes_at <= now() then
    raise exception 'Activity voting has closed';
  end if;
  if not exists (
    select 1 from public.talent7_competition_options option
    where option.id = target_option_id
      and option.campaign_id = target_campaign_id
      and option.moderation_status = 'Approved'
  ) then raise exception 'Choose an approved competition option'; end if;

  select vote.option_id into previous_option_id
  from public.talent7_competition_activity_votes vote
  where vote.campaign_id = target_campaign_id and vote.user_id = acting_user;

  if previous_option_id = target_option_id then return true; end if;

  if previous_option_id is not null then
    update public.talent7_competition_options
    set vote_count = greatest(vote_count - 1, 0), updated_at = now()
    where id = previous_option_id;
  end if;

  insert into public.talent7_competition_activity_votes (
    campaign_id, option_id, user_id
  ) values (
    target_campaign_id, target_option_id, acting_user
  )
  on conflict (campaign_id, user_id) do update set
    option_id = excluded.option_id,
    updated_at = now();

  update public.talent7_competition_options
  set vote_count = vote_count + 1, updated_at = now()
  where id = target_option_id;

  return true;
end;
$$;

create or replace function public.nominate_talent7_competition_activity(
  target_campaign_id uuid,
  target_activity text,
  target_pitch text
)
returns public.talent7_competition_options
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_name text;
  campaign public.talent7_competition_campaigns;
  saved_option public.talent7_competition_options;
begin
  if acting_user is null then raise exception 'Log in to nominate an activity'; end if;
  target_activity := btrim(coalesce(target_activity, ''));
  target_pitch := btrim(coalesce(target_pitch, ''));
  if char_length(target_activity) not between 3 and 80 then raise exception 'Keep the activity name between 3 and 80 characters'; end if;
  if char_length(target_pitch) not between 10 and 240 then raise exception 'Explain the event in 10 to 240 characters'; end if;

  select * into campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id;
  if campaign.id is null or campaign.phase <> 'Activity vote' then raise exception 'Nominations are not open'; end if;
  if campaign.vote_closes_at is not null and campaign.vote_closes_at <= now() then raise exception 'Nominations have closed'; end if;

  if (
    select count(*) from public.talent7_competition_options option
    where option.proposed_by = acting_user
      and option.created_at >= date_trunc('day', now())
  ) >= 3 then raise exception 'Daily nomination limit reached'; end if;

  select coalesce(nullif(btrim(profile.display_name), ''), nullif('@' || btrim(profile.username), ''), 'Talent7 member')
  into acting_name
  from public.profiles profile
  where profile.user_id = acting_user;

  insert into public.talent7_competition_options (
    campaign_id, activity, pitch, option_kind, moderation_status, proposed_by, proposer_name
  ) values (
    target_campaign_id, target_activity, target_pitch, 'Community', 'Pending', acting_user,
    coalesce(acting_name, 'Talent7 member')
  )
  returning * into saved_option;

  return saved_option;
exception
  when unique_violation then
    raise exception 'That activity has already been nominated';
end;
$$;

create or replace function public.vote_talent7_competition_schedule(
  target_campaign_id uuid,
  target_option_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  campaign public.talent7_competition_campaigns;
  schedule_option public.talent7_competition_schedule_options;
  previous_option_id uuid;
begin
  if acting_user is null then raise exception 'Log in to vote'; end if;
  select * into campaign from public.talent7_competition_campaigns where id = target_campaign_id for update;
  if campaign.id is null or campaign.phase not in ('Day vote', 'Time vote') then raise exception 'Schedule voting is not open'; end if;
  if campaign.vote_closes_at is not null and campaign.vote_closes_at <= now() then raise exception 'This vote has closed'; end if;

  select * into schedule_option
  from public.talent7_competition_schedule_options option
  where option.id = target_option_id
    and option.campaign_id = target_campaign_id
    and option.phase = campaign.phase
    and option.status = 'Active';
  if schedule_option.id is null then raise exception 'Choose an active schedule option'; end if;

  select vote.option_id into previous_option_id
  from public.talent7_competition_schedule_votes vote
  where vote.campaign_id = target_campaign_id
    and vote.phase = campaign.phase
    and vote.user_id = acting_user;
  if previous_option_id = target_option_id then return true; end if;

  if previous_option_id is not null then
    update public.talent7_competition_schedule_options
    set vote_count = greatest(vote_count - 1, 0)
    where id = previous_option_id;
  end if;

  insert into public.talent7_competition_schedule_votes (
    campaign_id, option_id, phase, user_id
  ) values (
    target_campaign_id, target_option_id, campaign.phase, acting_user
  )
  on conflict (campaign_id, phase, user_id) do update set
    option_id = excluded.option_id,
    updated_at = now();

  update public.talent7_competition_schedule_options
  set vote_count = vote_count + 1
  where id = target_option_id;
  return true;
end;
$$;

create or replace function public.register_talent7_competition_interest(
  target_campaign_id uuid,
  target_public_anonymous boolean default false,
  target_shipping_region text default 'To be confirmed'
)
returns public.talent7_competition_registrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  acting_name text;
  campaign public.talent7_competition_campaigns;
  saved_registration public.talent7_competition_registrations;
  next_sequence bigint;
  next_code text;
begin
  if acting_user is null then raise exception 'Log in to reserve a free place'; end if;
  target_shipping_region := coalesce(nullif(btrim(target_shipping_region), ''), 'To be confirmed');
  if char_length(target_shipping_region) not between 2 and 80 then raise exception 'Keep the shipping region between 2 and 80 characters'; end if;

  select * into campaign
  from public.talent7_competition_campaigns
  where id = target_campaign_id
  for update;
  if campaign.id is null or campaign.phase in ('Draft', 'Live', 'Review', 'Completed', 'Cancelled') then
    raise exception 'Interest registration is not open';
  end if;
  if campaign.scheduled_start is not null and campaign.scheduled_start <= now() then
    raise exception 'Registration has closed for this competition';
  end if;

  select * into saved_registration
  from public.talent7_competition_registrations registration
  where registration.campaign_id = target_campaign_id
    and registration.user_id = acting_user
  for update;

  if saved_registration.id is not null and saved_registration.status <> 'Withdrawn' then
    update public.talent7_competition_registrations
    set public_anonymous = coalesce(target_public_anonymous, false),
        shipping_region = target_shipping_region,
        updated_at = now()
    where id = saved_registration.id
    returning * into saved_registration;
    return saved_registration;
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), nullif('@' || btrim(profile.username), ''), 'Talent7 competitor')
  into acting_name
  from public.profiles profile
  where profile.user_id = acting_user;
  if acting_name is null then raise exception 'Complete your Talent7 profile before registering'; end if;

  next_sequence := campaign.registration_sequence + 1;
  loop
    next_code := 'T7-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.talent7_competition_registrations where registration_code = next_code
    );
  end loop;

  if saved_registration.id is null then
    insert into public.talent7_competition_registrations (
      campaign_id, user_id, display_name, public_anonymous, shipping_region,
      cohort_number, slot_number, registration_code
    ) values (
      target_campaign_id, acting_user, acting_name, coalesce(target_public_anonymous, false), target_shipping_region,
      floor((next_sequence - 1)::numeric / campaign.capacity_per_cohort)::integer + 1,
      ((next_sequence - 1) % campaign.capacity_per_cohort)::integer + 1,
      next_code
    ) returning * into saved_registration;
  else
    update public.talent7_competition_registrations
    set display_name = acting_name,
        public_anonymous = coalesce(target_public_anonymous, false),
        shipping_region = target_shipping_region,
        cohort_number = floor((next_sequence - 1)::numeric / campaign.capacity_per_cohort)::integer + 1,
        slot_number = ((next_sequence - 1) % campaign.capacity_per_cohort)::integer + 1,
        registration_code = next_code,
        status = 'Interested',
        updated_at = now()
    where id = saved_registration.id
    returning * into saved_registration;
  end if;

  update public.talent7_competition_campaigns
  set registration_count = registration_count + 1,
      registration_sequence = next_sequence,
      updated_at = now()
  where id = target_campaign_id;

  return saved_registration;
end;
$$;

create or replace function public.withdraw_talent7_competition_interest(target_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  changed_count integer;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;

  update public.talent7_competition_registrations
  set status = 'Withdrawn', updated_at = now()
  where campaign_id = target_campaign_id
    and user_id = acting_user
    and status in ('Interested', 'Confirmed');
  get diagnostics changed_count = row_count;

  if changed_count > 0 then
    update public.talent7_competition_campaigns
    set registration_count = greatest(registration_count - 1, 0), updated_at = now()
    where id = target_campaign_id;
  end if;
  return changed_count > 0;
end;
$$;

create or replace function public.get_my_talent7_competition_state(target_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'activity_option_id', (
      select vote.option_id
      from public.talent7_competition_activity_votes vote
      where vote.campaign_id = target_campaign_id and vote.user_id = auth.uid()
    ),
    'day_option_id', (
      select vote.option_id
      from public.talent7_competition_schedule_votes vote
      where vote.campaign_id = target_campaign_id and vote.user_id = auth.uid() and vote.phase = 'Day vote'
    ),
    'time_option_id', (
      select vote.option_id
      from public.talent7_competition_schedule_votes vote
      where vote.campaign_id = target_campaign_id and vote.user_id = auth.uid() and vote.phase = 'Time vote'
    ),
    'registration', (
      select to_jsonb(registration) - 'user_id'
      from public.talent7_competition_registrations registration
      where registration.campaign_id = target_campaign_id
        and registration.user_id = auth.uid()
        and registration.status <> 'Withdrawn'
    )
  );
$$;

revoke all on function public.vote_talent7_competition_activity(uuid, uuid) from public;
revoke all on function public.nominate_talent7_competition_activity(uuid, text, text) from public;
revoke all on function public.vote_talent7_competition_schedule(uuid, uuid) from public;
revoke all on function public.register_talent7_competition_interest(uuid, boolean, text) from public;
revoke all on function public.withdraw_talent7_competition_interest(uuid) from public;
revoke all on function public.get_my_talent7_competition_state(uuid) from public;

grant execute on function public.vote_talent7_competition_activity(uuid, uuid) to authenticated;
grant execute on function public.nominate_talent7_competition_activity(uuid, text, text) to authenticated;
grant execute on function public.vote_talent7_competition_schedule(uuid, uuid) to authenticated;
grant execute on function public.register_talent7_competition_interest(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_talent7_competition_interest(uuid) to authenticated;
grant execute on function public.get_my_talent7_competition_state(uuid) to authenticated;

comment on table public.talent7_competition_campaigns is
  'Community-shaped Talent7 events with staged activity, day, and time voting plus demand-based cohorts.';
comment on table public.talent7_competition_registrations is
  'Private competition interest records. Public anonymity never hides an entrant from authorized organizers.';

commit;
