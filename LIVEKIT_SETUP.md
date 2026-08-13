# Talent7 native live-video setup

Talent7 challenge rooms support native camera broadcasts through LiveKit Cloud, with YouTube retained as an optional fallback. LiveKit rooms are created automatically when the first authorized participant joins and close after everyone leaves.

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

Run `supabase/add-native-livekit-rooms.sql` in the Supabase SQL editor. A GitHub or Vercel deployment does not apply this migration.

## 5. Production test

Use three ordinary Talent7 accounts and one active challenge whose registered roster is complete.

1. As the organizer, open the challenge and choose **Talent7 camera (recommended)**.
2. Choose **Prepare camera room**, then **Go live in room**.
3. As each registered challenger, choose **Join with camera** and grant camera/microphone permission.
4. As the third account, choose **Watch live**. It must not receive camera or microphone controls.
5. Send live reactions from the audience account and confirm the totals update on the other devices.
6. End the broadcast as the organizer. All connected views should leave the native room, and re-entry should be rejected.

## Android wrapper note

The current Play Store WebView wrapper does not yet grant website camera and microphone requests. Native broadcasting therefore works in supported desktop/mobile browsers after this web deployment, but publishing inside the installed Android app requires the planned AAB update with Android camera/microphone permissions and a restricted `WebChromeClient.onPermissionRequest` handler. Audience playback may work in the existing wrapper, but it must still be included in the final Android device test.

Native Talent7 sessions are not recorded by this implementation. YouTube is the fallback when a persistent replay is required.
