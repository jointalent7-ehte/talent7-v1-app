# Talent7 push-notification setup

Talent7 uses Firebase Cloud Messaging (FCM) for the Android app and Supabase for private device ownership, preferences, and event creation.

## 1. Apply the database migration

Run `supabase/add-push-notifications.sql` in the Supabase SQL editor after migration 51.

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

1. Install Android version 1.3 on a test phone.
2. Log in and open **More > Notifications**.
3. Allow Android notifications and confirm the device status changes to **Connected**.
4. From a second account, send the first account a challenge invitation.
5. Confirm the phone receives a notification and tapping it opens Talent7 Invites.
6. Test accepting/declining, Go Live, opening voting, and completing a room.
7. From the first account, save a room owned by the second account. Confirm Go Live, voting, proof, and result notifications open that exact saved room.

If a device token becomes invalid, the delivery function disables it automatically.
