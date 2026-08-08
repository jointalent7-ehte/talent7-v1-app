# Cloudflare R2 setup for Talent7

Talent7 uses Supabase for accounts and database records. When all R2 environment variables are present, new proof and showcase file uploads go to one Cloudflare R2 bucket. If R2 is not configured, the existing Supabase Storage upload path remains active.

## 1. Create the bucket

1. Sign in to Cloudflare and open **R2 Object Storage**.
2. If prompted, enable R2 billing. Usage inside the free allowance is still free.
3. Select **Create bucket**.
4. Name it `talent7-media`.
5. Choose **Standard** storage and create the bucket.

## 2. Allow public viewing

Proof and showcase media are public Talent7 content.

1. Open the `talent7-media` bucket.
2. Open **Settings**.
3. Under **Public Development URL**, enable the `r2.dev` URL for testing.
4. Copy the resulting `https://pub-....r2.dev` address. Do not add a trailing slash.

For production, connect a custom domain such as `media.jointalent7.com` and use that address instead. Presigned uploads always use Cloudflare's private S3 API endpoint; the public address is only used to display uploaded files.

## 3. Add the browser CORS policy

In the bucket's **Settings → CORS Policy**, choose the JSON editor and save:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3009",
      "https://www.jointalent7.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the production origin if Talent7 uses another domain. Origins must match exactly and must not contain a trailing slash or path. Add the exact Vercel preview origin temporarily when testing a preview deployment.

## 4. Create restricted R2 credentials

1. Return to the main **R2 Object Storage** page.
2. Open **Manage R2 API Tokens**.
3. Select **Create API token**.
4. Choose **Object Read & Write** permission.
5. Restrict the token to the `talent7-media` bucket.
6. Create the token.
7. Copy the **Access Key ID** and **Secret Access Key** immediately; the secret is shown only once.

Never place these values in a file committed to GitHub. Never use a variable beginning with `NEXT_PUBLIC_` for either credential.

## 5. Find the Account ID

Cloudflare displays the Account ID on the R2 overview and in the S3 API endpoint:

```text
https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Copy only the Account ID portion.

## 6. Configure local development

Copy `.env.local.example` to `.env.local`, keep the existing Supabase values, and add:

```text
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=talent7-media
R2_PUBLIC_BASE_URL=https://pub-your-value.r2.dev
```

Restart the Next.js server after editing `.env.local`.

## 7. Configure Vercel

In **Vercel → Project → Settings → Environment Variables**, add the same five R2 variables for Production. Add them to Preview only when preview deployments should use the real media bucket. Redeploy after saving them.

## 8. Test safely

1. Sign in to Talent7 with a non-admin test account.
2. Upload one small JPG showcase post.
3. Confirm it appears inside `talent7-media/showcase-media/USER_ID/...` in R2.
4. Upload one small proof file and confirm it appears under `challenge-proofs/USER_ID/...`.
5. Delete both records in Talent7 and confirm their R2 objects disappear.
6. Confirm another ordinary user cannot delete the first user's media.

The application creates five-minute, single-object upload URLs only after validating the Supabase session. Photos remain limited to 10 MB and videos to 50 MB. R2 credentials stay on the server.

## Troubleshooting

- **Upload says CORS:** Ensure the exact Talent7 origin is in `AllowedOrigins` and `PUT` plus `Content-Type` are allowed. CORS changes can take about 30 seconds to propagate.
- **Upload returns 403:** Recheck Account ID, bucket name, token bucket scope, and both credential values.
- **File uploads to Supabase instead:** One or more R2 environment variables is missing or invalid; restart or redeploy after adding it.
- **Media URL returns 404:** Enable the public development URL or connect the production custom domain, then verify `R2_PUBLIC_BASE_URL`.
