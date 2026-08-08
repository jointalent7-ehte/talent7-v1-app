"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="routeStatePage" role="alert">
          <div className="routeStateMark error" aria-hidden="true">!</div>
          <p className="eyebrow">Something went wrong</p>
          <h1>Talent7 could not open</h1>
          <p>Your account data has not been deleted. Try loading Talent7 again.</p>
          <div className="routeStateActions">
            <button onClick={reset} type="button">Try again</button>
            <Link href="/">Return to Talent7</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
