# Talent7 production readiness

This document separates features that persist real multi-user data from previews, interest collection, and work that still needs operational setup.

## Current feature status

| Area | Status | What is real | Remaining launch work |
| --- | --- | --- | --- |
| Accounts | Connected | Supabase signup, confirmation, login, session restoration, logout, verified password change, reset email, and confirmation resend | Continue testing confirmation/reset with two real inboxes |
| Profiles | Connected | Unique profiles, interests, regions, follows, activity, trust badges, persistent achievements, and expiring Ready Now status | Apply the growth migration, test username collisions, and test Ready Now expiry with two accounts |
| Challenges | Connected | Create, edit, join, invite, share, chat, vote, rate, proof, complete, archive, delete, report, and privately save rooms | Apply all missing migrations, then run three-account permission tests |
| Teams | Connected | Team creation, join requests, approvals, member roles, and linked challenges | Apply role constraints and test every role against proof/result permissions |
| Showcase Talent | Future promo | Roadmap preview only in the launch navigation | Keep legacy data preserved but do not market it as an active service |
| Coaching | Future promo | Roadmap preview only in the launch navigation | Keep legacy data preserved; checkout, calling, and calendar booking are not active |
| Guidance | Future promo | Roadmap preview only in the launch navigation | Keep legacy data preserved and do not accept operational guidance requests at launch |
| Listen | Shared backend prepared | Supabase rooms, membership, reactions, song queue, owner archive/delete, and optional realtime refresh | Apply `add-shared-listen-rooms.sql` and test with two accounts |
| Notifications | Connected | In-app notifications and preference-controlled Firebase delivery cover invites, challenge updates, live rooms, voting, proof/results, saved rooms, and idempotent weekly summaries | Redeploy `send-push`, schedule weekly summaries, and test on a connected Android phone |
| Safety | Connected workflow | Challenge, chat, showcase, and comment reports with admin review states | Define response times, account suspension, appeals, and evidence retention |
| Plans | Interest collection only | Saves plan and founder-support interest | No money is charged; connect a payment provider before calling this checkout |
| Feed | Connected aggregation | Combines challenge, profile, proof, team, showcase, and coaching activity with pagination | Monitor query and rendering performance as production volume grows |
| Account deletion | Connected workflow | Password-confirmed request, seven-day cancellation, admin review/reject, server-only completion, media cleanup, and redacted audit state | Apply the deletion migration, add the service-role secret, and complete the three-account runbook |
| Error monitoring | Connected | Privacy-filtered Sentry reporting plus the production health endpoint, issue alerts, and uptime monitoring | Review alerts and monitor usage regularly |
| Conversion analytics | Connected, first party | Privacy-limited shared-link, auth, invite, completion, result-share, and league events in Supabase | Define consent, access, retention, and reporting before broader use |
| Android App Links | Code complete | Android 1.6.0 manifest/deep-link handling and public assetlinks route | Add Play app-signing SHA-256 in Vercel, sign versionCode 9, upload, and test from Play |

## Required SQL for this batch

Back up Supabase, compare the production migration history against `supabase/MIGRATION_ORDER.md`, apply any earlier missing migrations in documented order, then run `supabase/add-growth-engagement.sql` last. Do not rerun migrations already applied.

After SQL, redeploy `supabase/functions/send-push` and create the weekly Cron job documented in `GROWTH_ENGAGEMENT_SETUP.md`.

## Release gate

Do not deploy this batch until all three commands pass:

```bash
npm run typecheck
npm run lint
npm run build
```

After deploying, test with two ordinary accounts and one admin account. Never use the admin account as the only test user because admin policies intentionally bypass some ordinary-user restrictions.
