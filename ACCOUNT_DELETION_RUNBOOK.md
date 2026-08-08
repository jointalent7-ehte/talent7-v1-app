# Account deletion operations

Talent7 provides an authenticated deletion queue with a seven-day cancellation window. A user must confirm the current password and type `DELETE`. Only a user listed in `public.app_admins` can review, reject, or permanently complete the request.

## Production setup

1. Back up Supabase.
2. Run `supabase/add-account-deletion-workflow.sql` in the Supabase SQL editor.
3. In Vercel, add `SUPABASE_SERVICE_ROLE_KEY` to **Production** only. Copy the service-role key from the Supabase project API settings. Mark it sensitive, do not prefix it with `NEXT_PUBLIC_`, and redeploy.
4. Confirm both `challenge-proofs` and `showcase-media` Supabase Storage buckets exist. Keep all five R2 variables configured if R2 uploads are enabled.
5. Test with two ordinary accounts and a separate admin account.

## Test procedure

1. Upload one proof and one showcase item from the ordinary account.
2. Open **Account → Account deletion**, enter the current password, type `DELETE`, and submit.
3. Confirm the request appears for the user and in **Safety → Account deletion queue** for the admin.
4. Cancel it as the user and confirm the status changes to `Cancelled`.
5. Submit a second request and move it to `In review` as the admin.
6. For a real production test, wait until `eligible_after`. For an isolated test project only, the timestamp may be advanced in the SQL editor.
7. Complete deletion as the admin. Confirm the user can no longer log in, database-owned content is removed, uploaded R2/Storage objects are removed, and the completed audit row has its email redacted.

If cleanup fails, the request returns to `In review` with a short operational error. Investigate the R2, Storage, Supabase foreign-key, or service-role configuration before retrying. Never mark a request completed manually unless the Auth user, linked database records, and managed media have all been checked.

