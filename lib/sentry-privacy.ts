import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";
import type { TransactionEvent } from "@sentry/core";

function stripQueryString(value: string) {
  const queryIndex = value.indexOf("?");
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}

function sanitizeBaseEvent<T extends Event>(event: T) {
  event.user = undefined;
  event.extra = undefined;

  if (event.request) {
    event.request = {
      ...event.request,
      cookies: undefined,
      data: undefined,
      headers: undefined,
      query_string: undefined,
      url: event.request.url ? stripQueryString(event.request.url) : undefined
    };
  }

  return event;
}

export function sanitizeSentryEvent(event: ErrorEvent) {
  return sanitizeBaseEvent(event);
}

export function sanitizeSentryTransaction(event: TransactionEvent) {
  sanitizeBaseEvent(event);
  event.transaction = event.transaction ? stripQueryString(event.transaction) : undefined;
  event.spans = event.spans?.map((span) => ({
    ...span,
    data: {},
    description: span.description ? stripQueryString(span.description) : undefined
  }));

  return event;
}

export function sanitizeSentryBreadcrumb(breadcrumb: Breadcrumb) {
  if (breadcrumb.category?.startsWith("console")) {
    return null;
  }

  return {
    ...breadcrumb,
    data: undefined
  };
}
