# Talent7

Talent7 is a proof-based community challenge platform built with Next.js, React, TypeScript, and Supabase. The active launch product supports accounts, challenge rooms, teams, profiles, sharing, Ready Now matching, weekly leagues, shared Listen rooms, achievements, notifications, invitations, moderation, founder feedback, and optional one-time supporter contributions. Showcase Talent, Coaching, and Guidance are future previews shown only in Plans and Roadmap; their legacy hashes redirect there and cannot reopen the archived launch UI.

## Local development

Requirements: Node.js 20.9 or newer and a Supabase project.

1. Copy `.env.local.example` to `.env.local`.
2. Add your Supabase project URL and public anon key.
3. Install and run the app:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. If Supabase is not configured, the interface uses its built-in demo data where supported.

## Environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_public_anon_key
NEXT_PUBLIC_SITE_URL=https://www.jointalent7.com
ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=play_app_signing_sha256
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_public_cloudflare_turnstile_site_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_server_only_livekit_api_key
LIVEKIT_API_SECRET=your_server_only_livekit_api_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_server_only_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_server_only_razorpay_webhook_secret
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=raw_or_base64_service_account_json
GOOGLE_PLAY_RTDN_TOKEN=your_long_random_notification_token
```

`NEXT_PUBLIC_SITE_URL` is used for canonical metadata, the sitemap, and robots directives. The Turnstile site key is intentionally public; its matching secret key must be entered only in Supabase Authentication CAPTCHA settings. The service-role key is used only by the authenticated admin account-deletion endpoint. Add it to Vercel Production as a sensitive server-only value; never give it a `NEXT_PUBLIC_` prefix and never commit it.

The three LiveKit values enable native Talent7 camera broadcasts in challenge rooms. Create a LiveKit Cloud project, copy its WebSocket URL and API credentials into Vercel Production, and keep the API key and secret server-only. YouTube remains available in the app as a fallback broadcast method.

Follow [LIVEKIT_SETUP.md](LIVEKIT_SETUP.md) to configure and test native broadcasts on the website and Android wrapper.

Follow [TURNSTILE_SETUP.md](TURNSTILE_SETUP.md) before enabling CAPTCHA enforcement in Supabase.

Follow [PAYMENTS_SETUP.md](PAYMENTS_SETUP.md) before enabling real charges. The current website adapter supports fixed and custom one-time web payments, but Razorpay did not approve Talent7's business model; obtain written approval and replace or reconfigure the provider before accepting live website money. Google Play Billing handles the three fixed products in the Android app. All secrets remain server-only, and no supporter badge is granted until the provider purchase is verified by the Talent7 server.

Optional Cloudflare R2 variables move new challenge-proof uploads out of Supabase Storage while retaining Supabase as a safe fallback. The existing `showcase-media` path remains supported only so previously stored legacy media can be displayed where required for moderation and removed during account deletion:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
```

Follow [R2_SETUP.md](R2_SETUP.md). The access and secret keys are server-only and must never use the `NEXT_PUBLIC_` prefix.

## Database setup

Run the 73 SQL files in `supabase/` in the canonical order documented in [supabase/MIGRATION_ORDER.md](supabase/MIGRATION_ORDER.md). Existing projects must apply only migrations they have not already run. The payment entitlement migration is last because it extends the existing payment ledger. Legacy future-feature schemas remain in the history to preserve existing data; closing their UI routes does not authorize dropping their tables.

Uploading the repository to GitHub does not apply Supabase migrations. Run them separately in the Supabase SQL editor or through your migration workflow.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

`npm run check` runs all three checks in sequence.

## Deploying to Vercel

1. Push the source repository to GitHub.
2. Import it into Vercel as a Next.js project.
3. Add all required environment variables for Production and Preview as appropriate.
4. Use `npm ci` for installation and `npm run build` for the build.
5. Add the production and preview URLs to Supabase Authentication redirect URLs.
6. Apply the Supabase migrations before accepting real users.

Review [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) before making the site public.
Follow [ACCOUNT_DELETION_RUNBOOK.md](ACCOUNT_DELETION_RUNBOOK.md) before enabling permanent account deletion in production.
Follow [GROWTH_ENGAGEMENT_SETUP.md](GROWTH_ENGAGEMENT_SETUP.md) for Ready Now, achievements, weekly leagues, Firebase summaries, analytics retention, and Android App Links.
