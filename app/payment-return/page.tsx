"use client";

import { useEffect, useMemo, useState } from "react";

const allowedOutcomes = new Set(["captured", "authorized", "pending", "cancelled", "failed"]);

const outcomeCopy: Record<string, { eyebrow: string; title: string; body: string }> = {
  captured: {
    eyebrow: "Payment successful",
    title: "Your payment was verified",
    body: "Return to Talent7 to see your supporter purchase and refreshed badge."
  },
  authorized: {
    eyebrow: "Payment authorized",
    title: "Your payment is being finalized",
    body: "Return to Talent7. The app will refresh the payment status automatically."
  },
  pending: {
    eyebrow: "Confirmation pending",
    title: "PayU is still confirming the payment",
    body: "Return to Talent7. The app will verify the result before granting a badge."
  },
  cancelled: {
    eyebrow: "Checkout cancelled",
    title: "No supporter badge was changed",
    body: "Return to Talent7 whenever you are ready to try again."
  },
  failed: {
    eyebrow: "Payment not completed",
    title: "PayU could not complete this payment",
    body: "Return to Talent7 to retry or check your recent payment history."
  }
};

function buildReturnTargets() {
  const search = new URLSearchParams(window.location.search);
  const rawOutcome = search.get("payment") || "pending";
  const outcome = allowedOutcomes.has(rawOutcome) ? rawOutcome : "pending";
  const website = new URL("/", window.location.origin);
  website.searchParams.set("provider", "payu");
  website.searchParams.set("payment", outcome);
  website.hash = "plans";

  const query = `provider=payu&payment=${encodeURIComponent(outcome)}`;
  const appUrl = `talent7://payment-return?${query}`;
  const intentUrl = `intent://payment-return?${query}#Intent;scheme=talent7;package=com.jointalent7.app;S.browser_fallback_url=${encodeURIComponent(website.toString())};end`;

  return { outcome, websiteUrl: website.toString(), appUrl, intentUrl };
}

export default function PaymentReturnPage() {
  const [targets, setTargets] = useState<ReturnType<typeof buildReturnTargets> | null>(null);
  const copy = useMemo(() => outcomeCopy[targets?.outcome || "pending"], [targets]);

  useEffect(() => {
    const nextTargets = buildReturnTargets();
    setTargets(nextTargets);

    const nativeWindow = window as typeof window & { Talent7Billing?: unknown };
    if (nativeWindow.Talent7Billing) {
      window.location.replace(nextTargets.websiteUrl);
      return;
    }

    if (!/Android/i.test(window.navigator.userAgent)) {
      window.location.replace(nextTargets.websiteUrl);
      return;
    }

    const timer = window.setTimeout(() => {
      window.location.href = nextTargets.intentUrl;
    }, 150);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="paymentReturnPage">
      <section className="paymentReturnCard" aria-live="polite">
        <div className={`paymentReturnMark ${targets?.outcome === "captured" ? "success" : ""}`} aria-hidden="true">
          {targets?.outcome === "captured" ? "✓" : "7"}
        </div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="paymentReturnActions">
          <a className="paymentReturnPrimary" href={targets?.intentUrl || targets?.appUrl || "talent7://payment-return?provider=payu&payment=pending"}>
            Open Talent7 app
          </a>
          <a className="paymentReturnSecondary" href={targets?.websiteUrl || "/#plans"}>
            Continue in browser
          </a>
        </div>
        <small>If the app does not open automatically, tap “Open Talent7 app”.</small>
      </section>
    </main>
  );
}
