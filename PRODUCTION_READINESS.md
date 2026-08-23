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
| Plans and support | Code complete, externally gated | Three fixed one-time Supporter, Champion Supporter, and Founder Supporter digital purchases; server-verified permanent highest badge; payment history | Apply migration, configure Razorpay and Google Play, create Play products, connect webhooks/RTDN, and pass sandbox/Play-track tests before accepting money |
| Feed | Connected aggregation | Combines current challenge, join, proof, and completion activity from followed profiles with pagination | Monitor query and rendering performance as production volume grows |
| Account deletion | Connected workflow | Password-confirmed request, seven-day cancellation, admin review/reject, server-only completion, media cleanup, and redacted audit state | Apply the deletion migration, add the service-role secret, and complete the three-account runbook |
| Error monitoring | Connected | Privacy-filtered Sentry reporting plus the production health endpoint, issue alerts, and uptime monitoring | Review alerts and monitor usage regularly |
| Conversion analytics | Connected, first party | Privacy-limited shared-link, auth, invite, completion, result-share, and league events in Supabase | Define consent, access, retention, and reporting before broader use |
| Android App Links and Billing | Code complete, AAB pending | Android 1.6.0 manifest/deep-link handling, public assetlinks route, and server-verified fixed Google Play supporter products | Add Play app-signing SHA-256 in Vercel, configure Play products/API/RTDN, sync Billing 9.1.0, sign versionCode 9 if unused, upload, and test from Play |

## Required SQL for this batch

The source tree and `supabase/MIGRATION_ORDER.md` are reconciled at 73 numbered SQL files. Back up Supabase, compare production history against that list, apply any earlier missing migrations in documented order, then run `supabase/add-supporter-payments.sql` after the existing ledger and growth migrations if it has not already been applied. Do not rerun migrations already applied and do not remove legacy future-feature tables.

After SQL, redeploy `supabase/functions/send-push` and create the weekly Cron job documented in `GROWTH_ENGAGEMENT_SETUP.md` if those operator steps are still outstanding.

The web release can deploy independently, but charging must remain disabled until `PAYMENTS_SETUP.md` is complete. The final Android 1.6 AAB is required because Google Play Billing adds native code and a new dependency. Use versionCode 9 only if that code has not already been uploaded to Play Console; otherwise increment it before building.

## Release gate

Do not deploy this batch until all three commands pass:

```bash
npm run typecheck
npm run lint
npm run build
```

After deploying, test with two ordinary accounts and one admin account. Never use the admin account as the only test user because admin policies intentionally bypass some ordinary-user restrictions.
