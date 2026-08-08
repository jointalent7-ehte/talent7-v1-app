# Talent7 launch checklist

## Code and deployment

- Run `npm ci` and `npm run check` from a clean checkout.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` in Vercel.
- Set the server-only `SUPABASE_SERVICE_ROLE_KEY` for Production before enabling admin account-deletion completion; never prefix it with `NEXT_PUBLIC_`.
- Set `NEXT_PUBLIC_SENTRY_DSN` for Production and Preview, then follow `SENTRY_SETUP.md` to send one controlled verification event.
- If R2 is enabled, set all five server-only `R2_` variables, verify the bucket CORS origins, and never expose its secret key as `NEXT_PUBLIC_`.
- Confirm the production domain and HTTPS redirect work.
- Monitor `/api/health` from an external uptime service and alert the production owner when it becomes unavailable.
- Confirm `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest` use the production domain.
- Regenerate the Play Store screenshots after the current tab and dashboard redesign; the existing assets may show older navigation.
- Test the final production deployment at common phone, tablet, and desktop widths.

## Supabase

- Apply the migrations in `supabase/MIGRATION_ORDER.md`; run the policy-tightening migration last.
- Configure the Authentication Site URL and every allowed redirect URL.
- Configure branded confirmation, password-reset, and invitation email templates.
- Configure a production SMTP provider before a public launch.
- Verify email confirmation, password reset, sign-out, and session restoration.
- Create the intended `app_admins` records and keep admin access limited.
- Test room completion, proof upload, deletion, moderation, and invitations with at least two ordinary accounts plus one admin account.
- Confirm storage bucket types and upload limits match the app's photo/video limits.
- Upload and delete one proof and one showcase file in R2 using an ordinary production test account.
- Enable database backups appropriate to the launch plan.
- Review Supabase rate limits, bot protection, and CAPTCHA before opening public sign-up.
- Run the authenticated request, cancellation, admin review, waiting-period, and completion tests in `ACCOUNT_DELETION_RUNBOOK.md`.

## Trust, safety, and operations

- Review the Privacy, Support, Child Safety, Trust & Terms, and Delete Account pages with qualified legal/privacy reviewers for the launch regions.
- Publish working support and safety contact addresses and define a response owner.
- Document report review, content removal, account suspension, appeal, and evidence-retention procedures.
- Verify privacy-conscious Sentry error monitoring; do not send proof media or sensitive profile data to monitoring tools.
- Choose product analytics only after defining consent and retention rules; product analytics is not currently installed.
- Test keyboard navigation, screen-reader labels, reduced motion, color contrast, and 200% zoom on the deployed site.

## Release verification

- Create, join, invite to, complete, archive, and—when permitted—delete a challenge room.
- Upload photo and video proof and verify unauthorized users cannot manage it.
- Exercise teams, profiles, showcase, coaching, guidance, listen rooms, notifications, feedback, and moderation.
- Verify confirmations and success/error notices appear in the tab where the action occurred and dismiss automatically where appropriate.
- Test slow/offline requests and retry actions.
- Check the browser console and network log for production errors.
- Back up the production database before every material schema or policy change.
