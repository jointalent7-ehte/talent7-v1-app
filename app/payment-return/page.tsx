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

function buildReturnTargets(outcomeOverride?: string) {
  const search = new URLSearchParams(window.location.search);
  const rawOutcome = outcomeOverride || search.get("payment") || "pending";
  const outcome = allowedOutcomes.has(rawOutcome) ? rawOutcome : "pending";
  const website = new URL("/", window.location.origin);
  website.searchParams.set("provider", "payu");
  website.searchParams.set("payment", outcome);
  website.hash = "plans";

  const query = `provider=payu&payment=${encodeURIComponent(outcome)}`;
  const appUrl = `talent7://payment-return?${query}`;
  const intentUrl = `intent://payment-return?${query}#Intent;scheme=talent7;package=com.jointalent7.app;S.browser_fallback_url=${encodeURIComponent(website.toString())};end`;

  return {
    outcome,
    websiteUrl: website.toString(),
    appUrl,
    intentUrl,
    paymentRecordId: search.get("payment_id") || "",
    transactionId: search.get("txnid") || ""
  };
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

    // Keep the verified result visible in regular browsers. Automatically
    // navigating to an intent can leave a blank tab above this page when the
    // browser cannot complete the app hand-off, and user-agent based redirects
    // are unreliable when mobile Chrome requests a desktop version of a site.
    // Opening the app or continuing to the website remains an explicit action.
  }, []);

  useEffect(() => {
    if (!targets || targets.outcome !== "pending" || !targets.transactionId || !targets.paymentRecordId) return;

    let cancelled = false;
    let attempts = 0;
    let retryId: number | undefined;

    const checkPayment = async () => {
      attempts += 1;
      try {
        const query = new URLSearchParams({
          txnid: targets.transactionId,
          payment_id: targets.paymentRecordId
        });
        const response = await fetch(`/api/payments/payu/return-status?${query}`, { cache: "no-store" });
        const body = await response.json() as { outcome?: string };
        if (cancelled) return;
        if (response.ok && body.outcome && body.outcome !== "pending" && allowedOutcomes.has(body.outcome)) {
          setTargets(buildReturnTargets(body.outcome));
          const url = new URL(window.location.href);
          url.searchParams.set("payment", body.outcome);
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
          return;
        }
      } catch {
        // Keep the return page usable; Talent7 also checks again when reopened.
      }

      if (!cancelled && attempts < 6) {
        retryId = window.setTimeout(() => void checkPayment(), 2000);
      }
    };

    void checkPayment();
    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
    };
  }, [targets]);

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
