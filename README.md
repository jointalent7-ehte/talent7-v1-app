# Talent7

Talent7 is a proof-based challenge and talent platform built with Next.js, React, TypeScript, and Supabase. It supports accounts, challenge rooms, teams, profiles, showcase posts, coaching, expert guidance, notifications, invitations, moderation, and founder feedback.

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
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_public_cloudflare_turnstile_site_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_server_only_livekit_api_key
LIVEKIT_API_SECRET=your_server_only_livekit_api_secret
```

`NEXT_PUBLIC_SITE_URL` is used for canonical metadata, the sitemap, and robots directives. The Turnstile site key is intentionally public; its matching secret key must be entered only in Supabase Authentication CAPTCHA settings. The service-role key is used only by the authenticated admin account-deletion endpoint. Add it to Vercel Production as a sensitive server-only value; never give it a `NEXT_PUBLIC_` prefix and never commit it.

The three LiveKit values enable native Talent7 camera broadcasts in challenge rooms. Create a LiveKit Cloud project, copy its WebSocket URL and API credentials into Vercel Production, and keep the API key and secret server-only. YouTube remains available in the app as a fallback broadcast method.

Follow [LIVEKIT_SETUP.md](LIVEKIT_SETUP.md) to configure and test native broadcasts, including the current Android-wrapper limitation.

Follow [TURNSTILE_SETUP.md](TURNSTILE_SETUP.md) before enabling CAPTCHA enforcement in Supabase.

Optional Cloudflare R2 variables move new proof and showcase uploads out of Supabase Storage while retaining Supabase as a safe fallback:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
```

Follow [R2_SETUP.md](R2_SETUP.md). The access and secret keys are server-only and must never use the `NEXT_PUBLIC_` prefix.

## Database setup

Run the SQL files in `supabase/` in the order documented in [supabase/MIGRATION_ORDER.md](supabase/MIGRATION_ORDER.md). Existing projects should apply only migrations they have not already run, but must run `tighten-challenge-completion-and-proof-policies.sql` last. That migration replaces earlier broad completion and proof-upload policies with authenticated, role-aware policies.

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
3. Add all three environment variables for Production and Preview as appropriate.
4. Use `npm ci` for installation and `npm run build` for the build.
5. Add the production and preview URLs to Supabase Authentication redirect URLs.
6. Apply the Supabase migrations before accepting real users.

Review [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) before making the site public.
Follow [ACCOUNT_DELETION_RUNBOOK.md](ACCOUNT_DELETION_RUNBOOK.md) before enabling permanent account deletion in production.
