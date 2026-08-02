"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Talent7 route error", error);
  }, [error]);

  return (
    <main className="routeStatePage" role="alert">
      <div className="routeStateMark error" aria-hidden="true">!</div>
      <p className="eyebrow">Something went wrong</p>
      <h1>Talent7 could not open this workspace</h1>
      <p>Your account data has not been deleted. Try loading the workspace again.</p>
      <div className="routeStateActions">
        <button onClick={reset} type="button">Try again</button>
        <Link href="/">Return to Talent7</Link>
      </div>
    </main>
  );
}
