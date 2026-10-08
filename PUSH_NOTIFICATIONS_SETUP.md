# Talent7 push-notification setup

Talent7 uses Firebase Cloud Messaging (FCM) for the Android app and Supabase for private device ownership, preferences, and event creation.

## 1. Apply the database migration

Run `supabase/add-push-notifications.sql` in the position documented by `supabase/MIGRATION_ORDER.md`. The growth release also requires `supabase/add-growth-engagement.sql` after all earlier migrations.

## 2. Create the Firebase Android app

1. Open the Firebase console and create a project named `Talent7 Production`.
2. Add an Android app with package name `com.jointalent7.app`.
3. Download `google-services.json`.
4. Put it in the Android project at `app/google-services.json`.
5. In Firebase project settings, open **Cloud Messaging** and confirm the FCM HTTP v1 API is enabled.

`google-services.json` contains app identifiers, not the server private key. The server private key must never be committed to GitHub or copied into the Android app.

## 3. Configure the send-push Edge Function

From Firebase project settings > Service accounts, generate a new private key JSON. Copy these three JSON values into Supabase Edge Function secrets:

- `FIREBASE_PROJECT_ID` from `project_id`
- `FIREBASE_CLIENT_EMAIL` from `client_email`
- `FIREBASE_PRIVATE_KEY` from `private_key`, including the BEGIN/END lines

Generate a separate long random value for `PUSH_WEBHOOK_SECRET`.

Supabase automatically supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions.

Deploy the function without Supabase JWT verification because the Database Webhook authenticates with the separate secret header:

```powershell
supabase functions deploy send-push --no-verify-jwt
```

## 4. Create the Database Webhook

In Supabase, open **Database > Webhooks** and create an `INSERT` webhook:

- Table: `public.push_notification_events`
- Method: `POST`
- URL: the deployed `send-push` Edge Function URL
- Header name: `x-push-webhook-secret`
- Header value: the exact `PUSH_WEBHOOK_SECRET`

Do not enable update or delete events.

## 5. Test safely

1. Run `supabase/add-social-push-notifications.sql` after all earlier migrations.
2. Redeploy `send-push` so delivery uses the action, social, and digest Android channels.
3. Install Android version 1.6.4 on a test phone.
4. Log in and open **More > Notifications**. Confirm Android does not ask for permission by itself.
5. Tap **Enable on this phone**, allow Android notifications, and confirm the status changes to **Phone connected**.
6. From a second account, send the first account a challenge invitation. Confirm the Talent7 Signal sound plays and tapping the notification opens Talent7 Invites.
7. Add two replies to the first account's challenge within 90 seconds. Confirm only one push is queued for that short burst.
8. Follow the second account, enable **People you follow**, and publish a challenge from the second account. Confirm the follower receives one quiet social notification.
9. Test accepting/declining, Go Live, opening voting, completing a room, team requests, and open challenge-team requests.
10. From the first account, save a room owned by the second account. Confirm Go Live, voting, proof, and result notifications open that exact saved room.
11. Run `select public.queue_weekly_activity_summaries();` and confirm an opted-in account receives one silent weekly summary. Run it again and confirm no duplicate is created for the same week.

Android 8 and newer preserve sound and vibration choices per channel. Talent7 therefore uses the versioned `talent7_action_v2` channel for the original bundled sound, plus quiet `talent7_social_v1` and `talent7_digest_v1` channels. Changing the bundled action sound again requires a new action channel ID.

If a device token becomes invalid, the delivery function disables it automatically.
