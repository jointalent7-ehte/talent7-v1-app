# Talent7 production readiness

This document separates features that persist real multi-user data from previews, interest collection, and work that still needs operational setup.

## Current feature status

| Area | Status | What is real | Remaining launch work |
| --- | --- | --- | --- |
| Accounts | Connected | Supabase signup, confirmation, login, session restoration, logout, verified password change, reset email, and confirmation resend | Continue testing confirmation/reset with two real inboxes |
| Profiles | Connected | Unique profiles, interests, regions, follows, activity, trust badges, persistent achievements, and expiring Ready Now status | Apply the growth migration, test username collisions, and test Ready Now expiry with two accounts |
| Challenges | Connected | Create, edit, join, invite, share, chat, vote, rate, proof, complete, archive, delete, report, and privately save rooms | Apply all missing migrations, then run three-account permission tests |
| Teams | Connected | Team creation, join requests, approvals, member roles, and linked challenges | Apply role constraints and test every role against proof/result permissions |
| Showcase Talent | Future promo, legacy route closed | Plans/Roadmap preview only; `#showcase` and old post hashes redirect to Plans | Preserve legacy database/media for moderation and deletion; do not market or test it as an active service |
| Coaching | Future promo, legacy route closed | Plans/Roadmap preview only; `#coaching` redirects to Plans | Preserve legacy records; publishing, requests, checkout, calling, and booking are not launch services |
| Guidance | Future promo, legacy route closed | Plans/Roadmap preview only; `#expert-help` redirects to Plans | Preserve legacy records and do not accept or market operational guidance requests at launch |
| Listen | Shared backend prepared | Supabase rooms, membership, reactions, song queue, owner archive/delete, and optional realtime refresh | Apply `add-shared-listen-rooms.sql` and test with two accounts |
| Notifications | Connected | In-app notifications and preference-controlled Firebase delivery cover invites, challenge updates, live rooms, voting, proof/results, saved rooms, and idempotent weekly summaries | Redeploy `send-push`, schedule weekly summaries, and test on a connected Android phone |
| Safety | Connected workflow | Challenge, chat, showcase, and comment reports with admin review states | Define response times, account suspension, appeals, and evidence retention |
| Plans | Interest collection only | Saves plan and founder-support interest | No money is charged; connect a payment provider before calling this checkout |
| Feed | Connected aggregation | Combines current challenge, join, proof, and completion activity from followed profiles with pagination | Monitor query and rendering performance as production volume grows |
| Account deletion | Connected workflow | Password-confirmed request, seven-day cancellation, admin review/reject, server-only completion, media cleanup, and redacted audit state | Apply the deletion migration, add the service-role secret, and complete the three-account runbook |
| Error monitoring | Connected | Privacy-filtered Sentry reporting plus the production health endpoint, issue alerts, and uptime monitoring | Review alerts and monitor usage regularly |
| Conversion analytics | Connected, first party | Privacy-limited shared-link, auth, invite, completion, result-share, and league events in Supabase | Define consent, access, retention, and reporting before broader use |
| Android App Links | Code complete | Android 1.6.0 manifest/deep-link handling and public assetlinks route | Add Play app-signing SHA-256 in Vercel, sign versionCode 9, upload, and test from Play |

## Required SQL for this batch

The source tree and `supabase/MIGRATION_ORDER.md` are reconciled at 72 numbered SQL files. Back up Supabase, compare production history against that list, apply any earlier missing migrations in documented order, then run `supabase/add-growth-engagement.sql` last if it has not already been applied. Do not rerun migrations already applied and do not remove legacy future-feature tables.

After SQL, redeploy `supabase/functions/send-push` and create the weekly Cron job documented in `GROWTH_ENGAGEMENT_SETUP.md` if those operator steps are still outstanding.

The web release can deploy independently. The final Android 1.6 AAB remains pending; combine App Links with the planned billing decision in one signed bundle instead of producing two consecutive AABs. Use versionCode 9 only if that code has not already been uploaded to Play Console.

## Release gate

Do not deploy this batch until all three commands pass:

```bash
npm run typecheck
npm run lint
npm run build
```

After deploying, test with two ordinary accounts and one admin account. Never use the admin account as the only test user because admin policies intentionally bypass some ordinary-user restrictions.
