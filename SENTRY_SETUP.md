# Talent7 Sentry monitoring

Talent7 reports browser, server, edge, and React rendering errors to Sentry.

## Privacy defaults

- Session Replay is not installed or enabled.
- Default personally identifiable information collection is disabled.
- User identity, request headers, cookies, bodies, and query strings are removed before an event is sent.
- Console breadcrumbs are discarded and other breadcrumb metadata is removed.
- Production performance traces are sampled at 5%.

## Required Vercel variable

Set `NEXT_PUBLIC_SENTRY_DSN` for Production and Preview, then redeploy. The DSN is a public ingestion identifier; it is not a Sentry account credential.

## Controlled production verification

1. Generate a long random value and save it as `SENTRY_TEST_TOKEN` in Vercel Production.
2. Redeploy.
3. Send one authenticated POST request to `/api/sentry-test`.
4. Confirm that `Talent7 controlled Sentry verification` appears in the Sentry Issues page.
5. Remove `SENTRY_TEST_TOKEN` from Vercel and redeploy. Without the variable, the endpoint always returns 404.

PowerShell example:

```powershell
$headers = @{ Authorization = "Bearer YOUR_LONG_RANDOM_VALUE" }
Invoke-RestMethod -Method Post -Uri "https://www.jointalent7.com/api/sentry-test" -Headers $headers
```

## Optional source maps

Source-map upload is disabled unless `SENTRY_AUTH_TOKEN` is available during the build. Add a narrowly scoped Sentry organization token to Vercel only when source-map support is needed. Never use a personal account password or expose this token through a `NEXT_PUBLIC_` variable.
