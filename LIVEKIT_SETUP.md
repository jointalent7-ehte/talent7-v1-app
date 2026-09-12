# Talent7 LiveKit video and voice setup

Talent7 challenge rooms support native camera broadcasts through LiveKit Cloud, with YouTube retained as an optional fallback. Local Listen rooms use the same project for audio-only, host-moderated conversations. LiveKit rooms are created automatically when the first authorized participant joins and close after everyone leaves.

## 1. Create the LiveKit project

1. Sign in at `https://cloud.livekit.io`.
2. Create a production project.
3. Open the project settings and copy the Project URL. It starts with `wss://`.
4. Open the API keys page, create a key, and copy its API key and API secret.

## 2. Add Vercel Production variables

Add these three variables to the Talent7 Vercel project. Keep all three server-side; do not add `NEXT_PUBLIC_` to their names.

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

Redeploy Production after saving them.

## 3. Install and lock dependencies

From the repository root, run:

```powershell
npm install
npm run check
```

Commit both `package.json` and the updated `package-lock.json`.

## 4. Apply the Supabase migration

Run `supabase/add-native-livekit-rooms.sql` for challenge broadcasts. For Local Listen rooms, apply `supabase/restore-listen-rooms.sql` only if it has not already been applied, then run `supabase/add-area-voice-listen-rooms.sql` and `supabase/add-listen-microphone-notifications.sql`. A GitHub or Vercel deployment does not apply migrations.

## 5. Production test

Use three ordinary Talent7 accounts and one active challenge whose registered roster is complete.

1. As the organizer, open the challenge and choose **Talent7 camera (recommended)**.
2. Choose **Prepare camera room**, then **Go live in room**.
3. As each registered challenger, choose **Join with camera** and grant camera/microphone permission.
4. As the third account, choose **Watch live**. It must not receive camera or microphone controls.
5. Send live reactions from the audience account and confirm the totals update on the other devices.
6. End the broadcast as the organizer. All connected views should leave the native room, and re-entry should be rejected.

For Local Listen, create a room with an area such as **Nerul**, join from a second account, and confirm:

1. Both accounts see and can filter the room under **#nerul**.
2. The second account enters as a listener without microphone controls.
3. After the listener requests the microphone, only the host sees the approval action.
4. Approval changes the listener to a speaker; returning them to listener mode removes publishing permission.
5. No microphone or audio connection starts until the member presses **Enter voice room**.

## Android wrapper note

Android 1.5 and later includes camera/microphone permissions and a restricted `WebChromeClient.onPermissionRequest` handler that grants media capture only to trusted Talent7 HTTPS origins. Version 1.6.0 also adds verified App Links. That means Local Listen does not require a new wrapper permission, but speaker approval, microphone permission denial/recovery, audio routing, and background/foreground transitions must still be tested on a physical Play-distributed build before release.

Native Talent7 sessions are not recorded by this implementation. YouTube is the fallback when a persistent replay is required.
