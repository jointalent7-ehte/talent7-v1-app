# Talent7 V1 App

This is the starter for the real Talent7 web app.

It uses:

- Next.js for the app
- Supabase for database storage
- Vercel for hosting

## What works in this starter

- Create a challenge
- View challenge rooms
- Filter by Talent, Sports, or Gaming
- Vote for Team A or Team B
- Rate a challenge 7/7
- Show a first leaderboard shape
- Demo mode if Supabase is not connected

## Setup steps

1. Create a new Supabase project.
2. Open Supabase SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Copy your Supabase project URL.
5. Copy your Supabase anon public key.
6. In Vercel, add environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

7. Deploy this folder as a new Vercel project.

## Important safety note

The SQL policies are open for MVP testing so people can create challenges, votes, and ratings without accounts. Before a real public launch, tighten security with real authentication, moderation, anti-spam controls, and user ownership rules.

## First product scope

Build this before live video:

- Proof-based challenge rooms
- Badminton doubles
- Breakdance battles
- Mobile gaming matches
- Public 7-star ratings
- Audience voting
- Leaderboards

Live two-screen battles should come after this proof-based challenge MVP has real users.
