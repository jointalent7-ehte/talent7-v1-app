-- Transparent, skill-based sponsored prizes for Talent7 tournaments.
-- No entry fees, random draws, automatic payments, or collection of payout/address details.
-- Run after add-tournament-brackets.sql, add-push-notifications.sql, and add-clubs-and-scouting.sql.

begin;

create table if not exists public.tournament_prize_offers (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sponsor_user_id uuid references auth.users(id) on delete set null,
  sponsor_name text not null check (char_length(sponsor_name) between 2 and 80),
  title text not null check (char_length(title) between 3 and 100),
  prize_type text not null check (prize_type in ('Equipment', 'Voucher', 'Coaching', 'Digital reward', 'Other')),
  description text not null check (char_length(description) between 10 and 500),
  value_label text not null check (char_length(value_label) between 2 and 80),
  eligibility_text text not null check (char_length(eligibility_text) between 5 and 240),
  fulfillment_text text not null check (char_length(fulfillment_text) between 5 and 300),
  sponsor_url text check (sponsor_url is null or char_length(sponsor_url) <= 300),
  status text not null default 'Proposed'
    check (status in ('Proposed', 'Approved', 'Rejected', 'Withdrawn', 'Fulfilled')),
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_prize_claims (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null unique references public.tournament_prize_offers(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  champion_entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  claimant_name text not null check (char_length(claimant_name) between 2 and 80),
  claim_note text not null default '' check (char_length(claim_note) <= 300),
  status text not null default 'Submitted'
    check (status in ('Submitted', 'Verified', 'Rejected', 'Fulfilled')),
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournament_prize_offers_tournament_idx
on public.tournament_prize_offers (tournament_id, status, created_at desc);

create index if not exists tournament_prize_offers_sponsor_idx
on public.tournament_prize_offers (sponsor_user_id, created_at desc);

create index if not exists tournament_prize_claims_claimant_idx
on public.tournament_prize_claims (claimant_user_id, created_at desc);

alter table public.tournament_prize_offers enable row level security;
alter table public.tournament_prize_claims enable row level security;

revoke all on public.tournament_prize_offers, public.tournament_prize_claims from anon, authenticated;
grant select on public.tournament_prize_offers to authenticated;
grant select on public.tournament_prize_claims to authenticated;

drop policy if exists "Public reads approved tournament prizes" on public.tournament_prize_offers;
create policy "Public reads approved tournament prizes"
on public.tournament_prize_offers for select to authenticated
using (
  status in ('Approved', 'Fulfilled')
  or sponsor_user_id = auth.uid()
  or exists (
    select 1 from public.tournaments tournament
    where tournament.id = tournament_prize_offers.tournament_id and tournament.organizer_id = auth.uid()
  )
);

create or replace function public.get_public_talent7_tournament_prizes(target_tournament_id uuid)
returns table (
  id uuid,
  tournament_id uuid,
  sponsor_user_id uuid,
  sponsor_name text,
  title text,
  prize_type text,
  description text,
  value_label text,
  eligibility_text text,
  fulfillment_text text,
  sponsor_url text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    offer.id,
    offer.tournament_id,
    null::uuid as sponsor_user_id,
    offer.sponsor_name,
    offer.title,
    offer.prize_type,
    offer.description,
    offer.value_label,
    offer.eligibility_text,
    offer.fulfillment_text,
    offer.sponsor_url,
    offer.status,
    offer.created_at
  from public.tournament_prize_offers offer
  where offer.tournament_id = target_tournament_id
    and offer.status in ('Approved', 'Fulfilled')
  order by offer.created_at desc;
$$;

drop policy if exists "Prize participants read claims" on public.tournament_prize_claims;
create policy "Prize participants read claims"
on public.tournament_prize_claims for select to authenticated
using (
  claimant_user_id = auth.uid()
  or exists (
    select 1
    from public.tournament_prize_offers offer
    join public.tournaments tournament on tournament.id = offer.tournament_id
    where offer.id = tournament_prize_claims.offer_id
      and (offer.sponsor_user_id = auth.uid() or tournament.organizer_id = auth.uid())
  )
);

create or replace function public.propose_talent7_tournament_prize(
  target_tournament_id uuid,
  target_title text,
  target_prize_type text,
  target_description text,
  target_value_label text,
  target_eligibility_text text,
  target_fulfillment_text text,
  target_sponsor_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  actor_name text;
  target_tournament public.tournaments;
  saved_id uuid;
  clean_url text := nullif(trim(coalesce(target_sponsor_url, '')), '');
begin
  if acting_user is null then raise exception 'Log in before proposing a prize'; end if;
  select * into target_tournament from public.tournaments where id = target_tournament_id;
  if target_tournament.id is null then raise exception 'Tournament not found'; end if;
  if target_tournament.status not in ('Registration', 'Live') then raise exception 'Prizes can be proposed only before the tournament is completed'; end if;

  select nullif(trim(profile.display_name), '') into actor_name
  from public.profiles profile where profile.user_id = acting_user;
  if actor_name is null then raise exception 'Create your Talent7 profile before proposing a prize'; end if;
  if char_length(trim(coalesce(target_title, ''))) not between 3 and 100 then raise exception 'Use a prize title between 3 and 100 characters'; end if;
  if target_prize_type not in ('Equipment', 'Voucher', 'Coaching', 'Digital reward', 'Other') then raise exception 'Choose a valid prize type'; end if;
  if char_length(trim(coalesce(target_description, ''))) not between 10 and 500 then raise exception 'Use a prize description between 10 and 500 characters'; end if;
  if char_length(trim(coalesce(target_value_label, ''))) not between 2 and 80 then raise exception 'Describe the prize value in 2 to 80 characters'; end if;
  if char_length(trim(coalesce(target_eligibility_text, ''))) not between 5 and 240 then raise exception 'Describe eligibility in 5 to 240 characters'; end if;
  if char_length(trim(coalesce(target_fulfillment_text, ''))) not between 5 and 300 then raise exception 'Describe fulfilment in 5 to 300 characters'; end if;
  if clean_url is not null and (char_length(clean_url) > 300 or clean_url !~* '^https?://') then raise exception 'Sponsor link must be a valid HTTP or HTTPS URL'; end if;

  insert into public.tournament_prize_offers (
    tournament_id, sponsor_user_id, sponsor_name, title, prize_type, description, value_label,
    eligibility_text, fulfillment_text, sponsor_url
  ) values (
    target_tournament.id, acting_user, actor_name, trim(target_title), target_prize_type,
    trim(target_description), trim(target_value_label), trim(target_eligibility_text),
    trim(target_fulfillment_text), clean_url
  ) returning id into saved_id;

  perform public.enqueue_push_notification(
    target_tournament.organizer_id,
    acting_user,
    'Social',
    'New tournament prize proposal',
    actor_name || ' proposed "' || trim(target_title) || '" for ' || target_tournament.title || '.',
    '#tournaments',
    'tournament_prize',
    saved_id
  );
  return saved_id;
end;
$$;

create or replace function public.review_talent7_tournament_prize(
  target_offer_id uuid,
  approve_offer boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_offer public.tournament_prize_offers;
  target_tournament public.tournaments;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_offer from public.tournament_prize_offers where id = target_offer_id for update;
  if target_offer.id is null then raise exception 'Prize proposal not found'; end if;
  select * into target_tournament from public.tournaments where id = target_offer.tournament_id;
  if target_tournament.organizer_id <> acting_user then raise exception 'Only the tournament organizer can review this prize'; end if;
  if target_tournament.status = 'Cancelled' then raise exception 'This tournament has been cancelled'; end if;
  if target_offer.status <> 'Proposed' then raise exception 'This prize proposal has already been reviewed'; end if;

  update public.tournament_prize_offers
  set status = case when approve_offer then 'Approved' else 'Rejected' end,
      reviewed_at = now(), updated_at = now()
  where id = target_offer.id;

  if target_offer.sponsor_user_id is not null then
    perform public.enqueue_push_notification(
      target_offer.sponsor_user_id,
      acting_user,
      'Social',
      case when approve_offer then 'Tournament prize approved' else 'Tournament prize declined' end,
      target_tournament.title || case when approve_offer then ' will display your sponsored prize.' else ' did not approve your prize proposal.' end,
      '#tournaments',
      'tournament_prize',
      target_offer.id
    );
  end if;
  return true;
end;
$$;

create or replace function public.withdraw_talent7_tournament_prize(target_offer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_offer public.tournament_prize_offers;
  target_tournament public.tournaments;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_offer from public.tournament_prize_offers where id = target_offer_id for update;
  if target_offer.id is null or target_offer.sponsor_user_id is distinct from acting_user then raise exception 'Only the sponsor can withdraw this prize'; end if;
  if target_offer.status not in ('Proposed', 'Approved') then raise exception 'This prize can no longer be withdrawn'; end if;
  select * into target_tournament from public.tournaments where id = target_offer.tournament_id;
  if target_offer.status = 'Approved' and target_tournament.status <> 'Registration' then
    raise exception 'An approved prize cannot be withdrawn after the tournament starts';
  end if;
  if exists (select 1 from public.tournament_prize_claims claim where claim.offer_id = target_offer.id and claim.status in ('Submitted', 'Verified', 'Fulfilled')) then
    raise exception 'A winner claim is already being processed';
  end if;
  update public.tournament_prize_offers set status = 'Withdrawn', updated_at = now() where id = target_offer.id;
  return true;
end;
$$;

create or replace function public.claim_talent7_tournament_prize(
  target_offer_id uuid,
  target_claim_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  actor_name text;
  target_offer public.tournament_prize_offers;
  target_tournament public.tournaments;
  champion_entry public.tournament_entries;
  existing_claim public.tournament_prize_claims;
  saved_id uuid;
begin
  if acting_user is null then raise exception 'Log in before claiming a prize'; end if;
  if char_length(coalesce(target_claim_note, '')) > 300 then raise exception 'Keep the claim note under 300 characters'; end if;
  select * into target_offer from public.tournament_prize_offers where id = target_offer_id for update;
  if target_offer.id is null or target_offer.status <> 'Approved' then raise exception 'This prize is not available to claim'; end if;
  select * into target_tournament from public.tournaments where id = target_offer.tournament_id;
  if target_tournament.status <> 'Completed' then raise exception 'The tournament must be completed before its prize can be claimed'; end if;
  select * into champion_entry from public.tournament_entries
  where tournament_id = target_tournament.id and status = 'Champion' limit 1;
  if champion_entry.id is null then raise exception 'The tournament champion has not been recorded'; end if;
  if champion_entry.participant_user_id is distinct from acting_user
    and (champion_entry.team_id is null or not public.user_can_manage_talent_team(champion_entry.team_id, acting_user))
  then raise exception 'Only the verified tournament champion can claim this prize'; end if;

  select nullif(trim(profile.display_name), '') into actor_name from public.profiles profile where profile.user_id = acting_user;
  if actor_name is null then raise exception 'Create your Talent7 profile before claiming a prize'; end if;
  select * into existing_claim from public.tournament_prize_claims where offer_id = target_offer.id for update;
  if existing_claim.id is not null then
    if existing_claim.claimant_user_id = acting_user and existing_claim.status = 'Rejected' then
      update public.tournament_prize_claims
      set claim_note = trim(coalesce(target_claim_note, '')), status = 'Submitted', reviewed_at = null, updated_at = now()
      where id = existing_claim.id;
      saved_id := existing_claim.id;
    else
      raise exception 'This prize already has a claim';
    end if;
  else
    insert into public.tournament_prize_claims (
      offer_id, tournament_id, champion_entry_id, claimant_user_id, claimant_name, claim_note
    ) values (
      target_offer.id, target_tournament.id, champion_entry.id, acting_user, actor_name, trim(coalesce(target_claim_note, ''))
    ) returning id into saved_id;
  end if;

  if target_offer.sponsor_user_id is not null then
    perform public.enqueue_push_notification(
      target_offer.sponsor_user_id, acting_user, 'Social', 'Tournament prize claimed',
      actor_name || ' submitted the champion claim for "' || target_offer.title || '".',
      '#tournaments', 'tournament_prize_claim', saved_id
    );
  end if;
  if target_tournament.organizer_id is distinct from target_offer.sponsor_user_id then
    perform public.enqueue_push_notification(
      target_tournament.organizer_id, acting_user, 'Social', 'Prize claim needs verification',
      actor_name || ' submitted the champion claim for "' || target_offer.title || '".',
      '#tournaments', 'tournament_prize_claim', saved_id
    );
  end if;
  return saved_id;
end;
$$;

create or replace function public.review_talent7_tournament_prize_claim(
  target_claim_id uuid,
  approve_claim boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_claim public.tournament_prize_claims;
  target_offer public.tournament_prize_offers;
  target_tournament public.tournaments;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_claim from public.tournament_prize_claims where id = target_claim_id for update;
  if target_claim.id is null or target_claim.status <> 'Submitted' then raise exception 'This claim is not waiting for review'; end if;
  select * into target_offer from public.tournament_prize_offers where id = target_claim.offer_id;
  select * into target_tournament from public.tournaments where id = target_claim.tournament_id;
  if target_tournament.organizer_id <> acting_user then raise exception 'Only the tournament organizer can verify this claim'; end if;

  update public.tournament_prize_claims
  set status = case when approve_claim then 'Verified' else 'Rejected' end,
      reviewed_at = now(), updated_at = now()
  where id = target_claim.id;

  perform public.enqueue_push_notification(
    target_claim.claimant_user_id, acting_user, 'Social',
    case when approve_claim then 'Prize claim verified' else 'Prize claim needs attention' end,
    case when approve_claim then 'Your champion claim for "' || target_offer.title || '" was verified.' else 'Your claim for "' || target_offer.title || '" was not verified. Review the tournament result and try again if appropriate.' end,
    '#tournaments', 'tournament_prize_claim', target_claim.id
  );
  return true;
end;
$$;

create or replace function public.fulfill_talent7_tournament_prize_claim(target_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  acting_user uuid := auth.uid();
  target_claim public.tournament_prize_claims;
  target_offer public.tournament_prize_offers;
  target_tournament public.tournaments;
begin
  if acting_user is null then raise exception 'Authentication required'; end if;
  select * into target_claim from public.tournament_prize_claims where id = target_claim_id for update;
  if target_claim.id is null or target_claim.status <> 'Verified' then raise exception 'Only a verified claim can be marked fulfilled'; end if;
  select * into target_offer from public.tournament_prize_offers where id = target_claim.offer_id for update;
  select * into target_tournament from public.tournaments where id = target_claim.tournament_id;
  if target_offer.sponsor_user_id is distinct from acting_user and target_tournament.organizer_id <> acting_user then
    raise exception 'Only the sponsor or tournament organizer can confirm fulfilment';
  end if;

  update public.tournament_prize_claims set status = 'Fulfilled', fulfilled_at = now(), updated_at = now() where id = target_claim.id;
  update public.tournament_prize_offers set status = 'Fulfilled', fulfilled_at = now(), updated_at = now() where id = target_offer.id;
  perform public.enqueue_push_notification(
    target_claim.claimant_user_id, acting_user, 'Social', 'Tournament prize fulfilled',
    'The sponsor or organizer marked "' || target_offer.title || '" as fulfilled.',
    '#tournaments', 'tournament_prize_claim', target_claim.id
  );
  return true;
end;
$$;

revoke all on function public.propose_talent7_tournament_prize(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.get_public_talent7_tournament_prizes(uuid) from public;
revoke all on function public.review_talent7_tournament_prize(uuid, boolean) from public;
revoke all on function public.withdraw_talent7_tournament_prize(uuid) from public;
revoke all on function public.claim_talent7_tournament_prize(uuid, text) from public;
revoke all on function public.review_talent7_tournament_prize_claim(uuid, boolean) from public;
revoke all on function public.fulfill_talent7_tournament_prize_claim(uuid) from public;

grant execute on function public.propose_talent7_tournament_prize(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_public_talent7_tournament_prizes(uuid) to anon, authenticated;
grant execute on function public.review_talent7_tournament_prize(uuid, boolean) to authenticated;
grant execute on function public.withdraw_talent7_tournament_prize(uuid) to authenticated;
grant execute on function public.claim_talent7_tournament_prize(uuid, text) to authenticated;
grant execute on function public.review_talent7_tournament_prize_claim(uuid, boolean) to authenticated;
grant execute on function public.fulfill_talent7_tournament_prize_claim(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_prize_offers') then
    alter publication supabase_realtime add table public.tournament_prize_offers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournament_prize_claims') then
    alter publication supabase_realtime add table public.tournament_prize_claims;
  end if;
end;
$$;

commit;
