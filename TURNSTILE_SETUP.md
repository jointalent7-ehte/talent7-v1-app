# Cloudflare Turnstile setup

Talent7 uses Cloudflare Turnstile tokens for Supabase signup, login, confirmation resend, password reset, and the password verification performed before an account-deletion request.

## Production setup order

1. In Cloudflare, open **Turnstile** and create a widget named `Talent7 production auth`.
2. Choose **Managed** mode.
3. Allow these production hostnames:
   - `jointalent7.com`
   - `www.jointalent7.com`
   - `talent7-v1-app.vercel.app` (keep this only if the Vercel domain is used directly)
4. Copy the **site key** and **secret key**.
5. In Vercel, add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` with the public site key for Production, then redeploy.
6. Confirm the Turnstile security check appears on Talent7 signup/login and account-deletion forms.
7. In Supabase, open **Authentication > Bot and Abuse Protection** (the dashboard may group this under Authentication settings).
8. Enable CAPTCHA protection, select **Cloudflare Turnstile**, enter the Turnstile **secret key**, and save.
9. Test signup, login, confirmation resend, password reset, and account-deletion request from the production domain.

Do not put the Turnstile secret key in GitHub, browser code, or a `NEXT_PUBLIC_` Vercel variable. Supabase performs the server-side token validation.

## Local testing

Use a separate Turnstile widget for development and allow `localhost`, or use Cloudflare's documented testing keys. Never configure a production widget to trust local hostnames merely for convenience.

## Supabase authentication limits

After CAPTCHA is working, review **Authentication > Rate Limits** and **Authentication > Attack Protection**. Keep the password-reset per-user cooldown at least 60 seconds, keep email confirmation/resend limits conservative, and do not raise token or verification limits unless production evidence shows legitimate users are being blocked.
