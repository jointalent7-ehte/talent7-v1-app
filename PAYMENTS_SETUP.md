# Talent7 one-time supporter payments

Talent7 keeps all core access free. Website users can choose one of three supporter tiers or a custom support amount from ₹10 to ₹100,000. Android users can purchase the three fixed Google Play products:

| Talent7 product | Web amount | Google Play product ID |
| --- | ---: | --- |
| Supporter | ₹99 | `talent7_supporter_99` |
| Champion Supporter | ₹299 | `talent7_champion_supporter_299` |
| Founder Supporter | ₹999 | `talent7_founder_supporter_999` |

On the website, custom amounts of at least ₹99 grant the highest qualifying supporter badge: ₹99, ₹299, and ₹999 are the tier thresholds. Smaller custom support does not grant a badge. Custom amounts are not available through Google Play Billing. Supporter payments are never challenge entry fees, wagers, cash-prize payments, peer-to-peer payments, or collections on behalf of users.

## Website-provider approval gate

Razorpay rejected the current Talent7 business model. The Razorpay adapter remains in the source only to preserve the already-tested implementation; do not enable it for new live payments unless Razorpay later gives written approval. Before replacing it, send the candidate provider an accurate description of challenges, public/community features, Listen rooms, fixed supporter tiers, and custom support, and obtain written approval for the complete production experience. Cashfree is the first candidate to approach, but approval is not guaranteed and no Cashfree code is implemented yet.

Use `PAYMENT_PROVIDER_REVIEW.md` as the disclosure and question checklist. Website checkout is protected by two independent release switches:

```text
WEBSITE_PAYMENTS_ENABLED=false
NEXT_PUBLIC_WEBSITE_PAYMENTS_ENABLED=false
```

The first switch is server-enforced and authoritative. The second controls the customer-facing disabled state. Set both to `true` only after written approval, provider integration, and production acceptance testing. Google Play Billing remains independent of these website switches.

## 1. Apply the Supabase migration

Back up production and apply only missing migrations in `supabase/MIGRATION_ORDER.md`. For a project that already has migrations 1–72, run only:

```text
supabase/add-supporter-payments.sql
```

This must run after `add-payments.sql` and `add-growth-engagement.sql`. The browser cannot write either the payment ledger or entitlements; only server routes using `SUPABASE_SERVICE_ROLE_KEY` reconcile a badge from a captured provider payment.

## 2. Current Razorpay website adapter (not approved for live Talent7 use)

1. Keep production checkout disabled unless Razorpay provides written approval for the complete Talent7 model.
2. Verify `https://www.jointalent7.com` in Razorpay and confirm the public footer links to Terms and Conditions, Privacy Policy, Shipping Policy, Contact Us, and Cancellation and Refunds.
3. Start with Test Mode keys. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to Vercel Preview and Production as sensitive server-only values.
4. Create a long, unique webhook secret and add it to Vercel as `RAZORPAY_WEBHOOK_SECRET`.
5. Create a Razorpay webhook pointing to:

   `https://www.jointalent7.com/api/payments/razorpay/webhook`

6. Subscribe to `payment.captured`, `payment.failed`, `refund.processed`, and `order.paid`.
7. In test mode, test every fixed tier and the ₹10, ₹99, ₹299, ₹999, and ₹100,000 custom boundaries, then test dismissal, failure, duplicate webhook delivery, and refund downgrade/removal.
8. Do not install live keys until written business approval and the complete production-domain test both pass. Keep the live webhook secret synchronized with Vercel.

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
WEBSITE_PAYMENTS_ENABLED
NEXT_PUBLIC_WEBSITE_PAYMENTS_ENABLED
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
GOOGLE_PLAY_RTDN_TOKEN
```

Only variables intentionally prefixed with `NEXT_PUBLIC_` are exposed to the browser. `NEXT_PUBLIC_WEBSITE_PAYMENTS_ENABLED` is a display switch only; `WEBSITE_PAYMENTS_ENABLED` is the authoritative server gate. All credentials and secrets remain server-only.

## 5. Production acceptance tests

- Signed-out users are asked to sign in and no provider order is created.
- Each fixed web purchase uses its exact server-controlled amount and rejects unknown product codes.
- Custom website support accepts only server-validated INR amounts from ₹10 to ₹100,000.
- ₹99/₹299/₹999 fixed or custom thresholds grant the matching badge without downgrading a higher badge already earned; smaller custom support grants no badge.
- A dismissed, failed, pending, cancelled, forged, wrong-user, wrong-product, or wrong-amount purchase grants nothing.
- Replayed checkout callbacks, webhooks, RTDN messages, and purchase tokens do not duplicate entitlements.
- A Razorpay refund removes or downgrades the badge according to the user's remaining captured payments.
- Each Play product works from a Play testing install; pending purchase completion and **Restore Google Play purchases** both reconcile on the server.
- The badge appears on the account, discovery profiles, and shared profile page without exposing payment credentials.
- Payment history shows only the signed-in user's captured payments.

Keep provider dashboards, Vercel logs, Supabase payment rows, and webhook delivery history under observation during the first live release. Never log raw Google purchase tokens, Razorpay secrets, service-account JSON, card data, or full webhook bodies.
