-- Adds PayU to the provider-neutral payment ledger.
-- Run after add-cashfree-sandbox-payments.sql and before enabling PayU checkout.

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('Razorpay', 'Cashfree', 'PayU', 'Google Play'));

alter table public.payment_webhook_events
  drop constraint if exists payment_webhook_events_provider_check;

alter table public.payment_webhook_events
  add constraint payment_webhook_events_provider_check
  check (provider in ('Razorpay', 'Cashfree', 'PayU', 'Google Play'));

