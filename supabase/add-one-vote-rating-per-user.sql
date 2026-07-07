with ranked_votes as (
  select
    id,
    row_number() over (
      partition by challenge_id, user_id
      order by created_at asc, id asc
    ) as row_number
  from public.votes
  where user_id is not null
)
delete from public.votes
using ranked_votes
where public.votes.id = ranked_votes.id
  and ranked_votes.row_number > 1;

with ranked_ratings as (
  select
    id,
    row_number() over (
      partition by challenge_id, user_id
      order by created_at asc, id asc
    ) as row_number
  from public.ratings
  where user_id is not null
)
delete from public.ratings
using ranked_ratings
where public.ratings.id = ranked_ratings.id
  and ranked_ratings.row_number > 1;

create unique index if not exists one_vote_per_user_per_challenge
on public.votes (challenge_id, user_id)
where user_id is not null;

create unique index if not exists one_rating_per_user_per_challenge
on public.ratings (challenge_id, user_id)
where user_id is not null;
