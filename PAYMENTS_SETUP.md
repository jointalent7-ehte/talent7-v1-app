# Talent7 one-time digital badge payments

Talent7 keeps all core access free. Payments purchase one of three defined digital profile badge products delivered permanently to the buyer's profile:

| Talent7 product | Web amount | Google Play product ID |
| --- | ---: | --- |
| Talent7 Badge | ₹99 | `talent7_supporter_99` |
| Champion Badge | ₹299 | `talent7_champion_supporter_299` |
| Founder Badge | ₹999 | `talent7_founder_supporter_999` |

Website and Android checkout expose only these three defined digital products. There is no user-entered payment amount, challenge entry fee, wager, cash-prize payment, peer-to-peer payment, or collection on behalf of users.

## 1. Apply the Supabase migration

Back up production and apply only missing migrations in `supabase/MIGRATION_ORDER.md`. For a project that already has migrations 1–72, run only:

```text
supabase/add-supporter-payments.sql
```

This must run after `add-payments.sql` and `add-growth-engagement.sql`. The browser cannot write either the payment ledger or entitlements; only server routes using `SUPABASE_SERVICE_ROLE_KEY` reconcile a badge from a captured provider payment.

## 2. Configure Razorpay for the website

1. Create or open the Talent7 Razorpay account and complete the provider's activation/KYC requirements.
2. Verify `https://www.jointalent7.com` in Razorpay and confirm the public footer links to Terms and Conditions, Privacy Policy, Shipping Policy, Contact Us, and Cancellation and Refunds.
3. Start with Test Mode keys. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Vercel Preview and Production as sensitive server-only values.
4. Create a long, unique webhook secret and add it to Vercel as `RAZORPAY_WEBHOOK_SECRET`.
5. Create a Razorpay webhook pointing to:

   `https://www.jointalent7.com/api/payments/razorpay/webhook`

6. Subscribe to `payment.captured`, `payment.failed`, `refund.processed`, and `order.paid`.
7. Deploy, make test purchases for every fixed tier, then test dismissal, failure, duplicate webhook delivery, and refund downgrade/removal.
8. Replace Test Mode keys with live keys only after the complete production-domain test passes. Keep the live webhook secret synchronized with Vercel.

Checkout success alone never grants a badge. Talent7 validates the checkout HMAC, fetches the Razorpay payment and order, compares amount/currency/order ownership, and requires both to report a captured/paid state. Webhooks are signature checked and deduplicated.

## 3. Configure Google Play Billing for Android

1. In Play Console, create three **one-time products** with the exact product IDs in the table above. Set their India prices to ₹99, ₹299, and ₹999 and activate them.
2. Create a Google Cloud service account for server verification, enable the Google Play Android Developer API, link the account in Play Console, and grant only the permissions required to view orders/subscriptions and manage purchases.
3. Download its JSON key. Store either the raw JSON or its base64 encoding in Vercel as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Never commit the JSON file.
4. Generate a long random `GOOGLE_PLAY_RTDN_TOKEN` and store it in Vercel.
5. Configure Google Play Real-time Developer Notifications through a Google Cloud Pub/Sub topic. Create a push subscription to:

   `https://www.jointalent7.com/api/payments/google-play/rtdn?token=YOUR_URL_ENCODED_TOKEN`

6. Grant the Google Play notifications service account permission to publish to the topic, send a test notification, and confirm the endpoint returns HTTP 200.
7. Build a new signed AAB and upload it to an internal or closed test track. Billing cannot be tested reliably from a sideloaded release; install it through Google Play with a license-test account.

The Android wrapper uses `com.android.billingclient:billing:9.1.0`. It passes a SHA-256 hash of the Talent7 user ID as the obfuscated account ID. The server verifies the package purchase token and account binding, records pending/cancelled/captured state, grants the badge only after `PURCHASED`, and then acknowledges the product. Do not acknowledge or grant purchases only on the device.

## 4. Required Vercel values

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
GOOGLE_PLAY_RTDN_TOKEN
```

Only the Supabase URL and anon key are public. Every other value in this list is server-only and must not use a `NEXT_PUBLIC_` prefix.

## 5. Production acceptance tests

- Signed-out users are asked to sign in and no provider order is created.
- Each fixed web purchase uses its exact server-controlled amount and rejects unknown or client-supplied product codes.
- ₹99/₹299/₹999 grant the matching badge without downgrading a higher badge already earned.
- A dismissed, failed, pending, cancelled, forged, wrong-user, wrong-product, or wrong-amount purchase grants nothing.
- Replayed checkout callbacks, webhooks, RTDN messages, and purchase tokens do not duplicate entitlements.
- A Razorpay refund removes or downgrades the badge according to the user's remaining captured payments.
- Each Play product works from a Play testing install; pending purchase completion and **Restore Google Play purchases** both reconcile on the server.
- The badge appears on the account, discovery profiles, and shared profile page without exposing payment credentials.
- Payment history shows only the signed-in user's captured payments.

Keep provider dashboards, Vercel logs, Supabase payment rows, and webhook delivery history under observation during the first live release. Never log raw Google purchase tokens, Razorpay secrets, service-account JSON, card data, or full webhook bodies.
