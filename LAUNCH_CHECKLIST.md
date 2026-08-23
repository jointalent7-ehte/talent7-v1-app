# Talent7 launch checklist

## Code and deployment

- Run `npm ci` and `npm run check` from a clean checkout.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` in Vercel.
- Set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` to the Play Console **App signing** SHA-256 certificate fingerprint.
- Set the server-only `SUPABASE_SERVICE_ROLE_KEY` for Production before enabling admin account-deletion completion; never prefix it with `NEXT_PUBLIC_`.
- Before accepting money, set all server-only Razorpay and Google Play values documented in `PAYMENTS_SETUP.md`; test signatures, provider verification, webhook retries, refunds, pending purchases, and restoration before switching Razorpay to live keys.
- For native challenge video, set server-only `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in Vercel Production; never expose the key or secret as `NEXT_PUBLIC_`.
- Set `NEXT_PUBLIC_SENTRY_DSN` for Production and Preview, then follow `SENTRY_SETUP.md` to send one controlled verification event.
- If R2 is enabled, set all five server-only `R2_` variables, verify the bucket CORS origins, and never expose its secret key as `NEXT_PUBLIC_`.
- Confirm the production domain and HTTPS redirect work.
- Monitor `/api/health` from an external uptime service and alert the production owner when it becomes unavailable.
- Confirm `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest` use the production domain.
- Confirm `/.well-known/assetlinks.json` returns HTTP 200 on every Android App Link host without a redirect or login.
- Regenerate the Play Store screenshots after the current tab and dashboard redesign; the existing assets may show older navigation.
- Test the final production deployment at common phone, tablet, and desktop widths.
- Test a native live challenge with two challenger accounts and one audience account: challengers should receive camera controls, audience must remain watch-only, and ending the broadcast must disconnect all three.

## Supabase

- Apply only missing migrations in the exact order in `supabase/MIGRATION_ORDER.md`; never replay the full list on an existing database.
- Apply `add-supporter-payments.sql` only after `add-payments.sql` and `add-growth-engagement.sql`, then confirm ordinary users cannot insert or update `payments` or `supporter_entitlements`.
- Configure the Authentication Site URL and every allowed redirect URL.
- Configure branded confirmation, password-reset, and invitation email templates.
- Configure a production SMTP provider before a public launch.
- Verify email confirmation, password reset, sign-out, and session restoration.
- Create the intended `app_admins` records and keep admin access limited.
- Test room completion, proof upload, deletion, moderation, and invitations with at least two ordinary accounts plus one admin account.
- Save and unsave active and archived rooms with two ordinary accounts; confirm each account sees only its own Saved collection after signing out and back in.
- Confirm a saved-room user receives Live, Voting, Proof, and Result notifications exactly once and each notification opens the correct room.
- Deploy the updated `send-push` Edge Function, schedule `queue_weekly_activity_summaries()` weekly, and verify the idempotency test in `GROWTH_ENGAGEMENT_SETUP.md`.
- Test Ready Now expiry, achievement refresh, weekly league scoring, and shared-link return through email confirmation with two ordinary accounts.
- Confirm storage bucket types and upload limits match the app's photo/video limits.
- Upload and delete one challenge proof in R2 using an ordinary production test account. If a disposable legacy showcase fixture already exists, verify account deletion removes its media without reopening the closed Showcase UI.
- Enable database backups appropriate to the launch plan.
- Review Supabase rate limits, bot protection, and CAPTCHA before opening public sign-up.
- Run the authenticated request, cancellation, admin review, waiting-period, and completion tests in `ACCOUNT_DELETION_RUNBOOK.md`.

## Trust, safety, and operations

- Review the Privacy, Support, Child Safety, Trust & Terms, and Delete Account pages with qualified legal/privacy reviewers for the launch regions.
- Publish working support and safety contact addresses and define a response owner.
- Document report review, content removal, account suspension, appeal, and evidence-retention procedures.
- Verify privacy-conscious Sentry error monitoring; do not send proof media or sensitive profile data to monitoring tools.
- Define consent, access, and retention rules for the first-party `growth_events` table before using it beyond basic conversion measurement.
- Test keyboard navigation, screen-reader labels, reduced motion, color contrast, and 200% zoom on the deployed site.

## Release verification

- Verify Save room, Saved collection, unsave, and session restoration with two ordinary accounts.

- Create, join, invite to, complete, archive, and, when permitted, delete a challenge room.
- Upload photo and video proof and verify unauthorized users cannot manage it.
- Exercise teams, profiles, sharing, Ready Now, weekly leagues, notifications, feedback, and moderation. Confirm Listen is absent from public navigation and `#listen-rooms` redirects to Challenges. Confirm `#showcase`, old showcase-post hashes, `#coaching`, and `#expert-help` redirect to the Plans future preview and expose no legacy creation/request UI.
- Install the combined signed Android 1.6 release from a Play testing track. Verify App Links plus all three fixed Play products, pending/cancelled/completed states, server verification, purchase restoration, highest-tier badges, and website fallback after uninstalling. Confirm that both website and Android expose only the three defined digital badge products.
- Verify confirmations and success/error notices appear in the tab where the action occurred and dismiss automatically where appropriate.
- Test slow/offline requests and retry actions.
- Check the browser console and network log for production errors.
- Back up the production database before every material schema or policy change.
