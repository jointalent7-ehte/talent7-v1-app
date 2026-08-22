# Growth and engagement setup

This release adds shared-link conversion continuity, privacy-limited conversion events, Ready Now matching, persistent achievements, weekly leagues, weekly Firebase summaries, and verified Android App Links.

## 1. Apply the Supabase migration

Back up production, confirm all earlier migrations in `supabase/MIGRATION_ORDER.md`, then run `supabase/add-growth-engagement.sql`. Do not run the full migration list again on an existing database.

## 2. Schedule weekly summaries

In Supabase Dashboard > Integrations > Cron, create a weekly job for Monday after 09:00 in the audience's primary timezone:

```sql
select public.queue_weekly_activity_summaries();
```

The function is idempotent for each user and calendar week. It writes to `push_notification_events`; the existing Database Webhook and `send-push` Edge Function deliver through Firebase. Redeploy `supabase/functions/send-push` because this release adds the `Weekly summary` category and preference.

## 3. Configure Android App Links

1. In Play Console, open Setup > App integrity.
2. Copy the SHA-256 fingerprint under **App signing key certificate**, not only the upload certificate.
3. Set `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS` in Vercel Production. Separate multiple fingerprints with commas.
4. Deploy and confirm `https://www.jointalent7.com/.well-known/assetlinks.json` returns HTTP 200 without a redirect or authentication.
5. Confirm the same file works on `https://jointalent7.com` if that host remains in the Android manifest.
6. Build and sign Android version 1.6.0, versionCode 9, with the existing private upload keystore.

The route always includes the current upload-certificate SHA-256 fingerprint for direct/internal builds. Play-installed builds normally require Google's separate app-signing fingerprint from Play Console.

## 4. Production tests

- Open a shared profile, team, invite, room, and result in a browser without being logged in.
- Sign up with email confirmation and confirm Talent7 returns to the exact destination and highlights the intended action without submitting it.
- Enable Ready Now, verify the profile moves ahead of other matches, then end it and verify it disappears.
- Unlock an achievement and refresh the dashboard.
- Join a weekly league with two accounts and verify scores refresh after challenge activity.
- Run `select public.queue_weekly_activity_summaries();` twice and confirm only one weekly event per user is created.
- Install the Play-distributed app and verify shared HTTPS links open in Talent7; uninstall it and verify the same links open on the website.

## Privacy limits

`growth_events` stores an event name, optional authenticated user, pseudonymous browser ID, resource type/token, source, and timestamp. It does not store email, message text, proof media, precise venue details, or device tokens. Define retention and consent rules before using this data for broader behavioral profiling or third-party analytics.

An authenticated `app_admins` user can inspect the basic 30-day conversion totals without direct table access:

```sql
select * from public.get_growth_funnel(30);
```
