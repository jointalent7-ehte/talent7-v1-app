import * as Sentry from "@sentry/nextjs";
import {
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeSentryTransaction
} from "./lib/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0,
  beforeSend: sanitizeSentryEvent,
  beforeSendTransaction: sanitizeSentryTransaction,
  beforeBreadcrumb: sanitizeSentryBreadcrumb,
  ignoreErrors: [
    "AbortError",
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications"
  ]
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
