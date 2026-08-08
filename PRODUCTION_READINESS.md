# Talent7 production readiness

This document separates features that persist real multi-user data from previews, interest collection, and work that still needs operational setup.

## Current feature status

| Area | Status | What is real | Remaining launch work |
| --- | --- | --- | --- |
| Accounts | Connected | Supabase signup, confirmation, login, session restoration, logout, verified password change, reset email, and confirmation resend | Continue testing confirmation/reset with two real inboxes |
| Profiles | Connected | Unique profiles, interests, regions, follows, activity, and trust badges | Apply production constraints and test username collisions |
| Challenges | Connected | Create, edit, join, invite, chat, vote, rate, proof, complete, archive, delete, and report | Apply hardening migration and run three-account permission tests |
| Teams | Connected | Team creation, join requests, approvals, member roles, and linked challenges | Apply role constraints and test every role against proof/result permissions |
| Showcase | Connected | Posts, R2 photo/video uploads, ratings, comments, reports, edit, and delete | Add comment management and moderation response targets |
| Coaching | Connected marketplace | Offers, learner interest, and coach status updates | It does not yet include checkout, video calling, or calendar booking |
| Guidance | Connected workflow | Expert applications, admin verification, requests, assignment, replies, scheduling, links, completion, and feedback | Define an operator response process and test sensitive-data handling |
| Listen | Shared backend prepared | Supabase rooms, membership, reactions, song queue, owner archive/delete, and optional realtime refresh | Apply `add-shared-listen-rooms.sql` and test with two accounts |
| Notifications | Shared read state prepared | Notifications are derived from real activity; read state now follows the signed-in user | Apply `add-notification-read-state.sql`; push notifications are not included |
| Safety | Connected workflow | Challenge, chat, showcase, and comment reports with admin review states | Define response times, account suspension, appeals, and evidence retention |
| Plans | Interest collection only | Saves plan and founder-support interest | No money is charged; connect a payment provider before calling this checkout |
| Feed | Connected aggregation | Combines challenge, profile, proof, team, showcase, and coaching activity | Add pagination before data volume grows |
| Account deletion | Manual request | Public email-request page satisfies a manual deletion route | Add an authenticated deletion-request queue and operator completion workflow |
| Error monitoring | Connected | Privacy-filtered Sentry reporting for browser, server, edge, route, and global rendering errors | Verify the controlled production event and configure alert ownership |
| Product analytics | Not installed | Basic Vercel traffic information only | Choose analytics only after defining consent and retention rules |

## Required SQL for this batch

Back up Supabase first, then apply these files in order:

1. `supabase/add-shared-listen-rooms.sql`
2. `supabase/add-notification-read-state.sql`
3. `supabase/harden-production-user-actions.sql`

The last migration removes duplicate per-user challenge joins if any exist, prevents future duplicates, locks completion transitions, constrains roles and usernames, and limits status updates to their intended columns.

## Release gate

Do not deploy this batch until all three commands pass:

```bash
npm run typecheck
npm run lint
npm run build
```

After deploying, test with two ordinary accounts and one admin account. Never use the admin account as the only test user because admin policies intentionally bypass some ordinary-user restrictions.
