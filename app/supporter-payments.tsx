"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  customSupportMaximumSubunits,
  customSupportMinimumSubunits,
  customSupportProductCode,
  formatInrSubunits,
  supporterProductByCode,
  supporterProducts,
  supporterTierLabel,
  type SupporterProduct,
  type SupporterTier
} from "../lib/supporter-products";

type PaymentRow = {
  amount_subunits: number;
  captured_at: string | null;
  created_at: string;
  currency: string;
  id: string;
  product_code: string;
  product_name: string;
  provider: "Razorpay" | "Google Play";
  refunded_at: string | null;
  status: "Creating" | "Created" | "Pending" | "Authorized" | "Captured" | "Failed" | "Cancelled" | "Refunded";
};

type PaymentStatus = {
  entitlement: { active: boolean; granted_at: string; tier: SupporterTier; updated_at: string } | null;
  payments: PaymentRow[];
};

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  amount: number;
  currency: string;
  description: string;
  handler: (response: RazorpayResponse) => void | Promise<void>;
  key: string;
  modal: { ondismiss: () => void };
  name: string;
  order_id: string;
  prefill?: { email?: string; name?: string };
  theme: { color: string };
};

type NativePurchaseDetail = {
  message?: string;
  productId?: string;
  purchaseToken?: string;
  state?: "PURCHASED" | "PENDING" | "CANCELLED" | "ERROR";
};

type NativeProductDetail = {
  formattedPrice?: string;
  productId?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
    Talent7Billing?: {
      isAvailable: () => boolean;
      purchase: (productId: string, talent7UserId: string) => void;
      queryProducts: (productIdsJson: string) => void;
      restorePurchases: () => void;
    };
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout requires a browser."));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
}

function paymentAmount(row: PaymentRow) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: row.currency,
      maximumFractionDigits: 2
    }).format(row.amount_subunits / 100);
  } catch {
    return `${row.currency} ${row.amount_subunits / 100}`;
  }
}

async function apiRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers
    },
    cache: "no-store"
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "The payment request failed.");
  return body;
}

export default function SupporterPayments({
  accessToken,
  displayName,
  email,
  onEntitlementChange,
  onNotice,
  onRequireLogin,
  userId
}: {
  accessToken?: string;
  displayName?: string;
  email?: string;
  onEntitlementChange: (tier: SupporterTier | null) => void;
  onNotice: (message: string, tone?: "success" | "error" | "warning" | "info") => void;
  onRequireLogin: () => void;
  userId?: string;
}) {
  const [status, setStatus] = useState<PaymentStatus>({ entitlement: null, payments: [] });
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [customAmount, setCustomAmount] = useState("299");
  const [nativeBilling, setNativeBilling] = useState(false);
  const [nativePrices, setNativePrices] = useState<Record<string, string>>({});
  const onEntitlementChangeRef = useRef(onEntitlementChange);
  const onNoticeRef = useRef(onNotice);

  useEffect(() => {
    onEntitlementChangeRef.current = onEntitlementChange;
    onNoticeRef.current = onNotice;
  }, [onEntitlementChange, onNotice]);

  const refreshStatus = useCallback(async () => {
    if (!accessToken) {
      setStatus({ entitlement: null, payments: [] });
      onEntitlementChangeRef.current(null);
      return;
    }
    setLoadingStatus(true);
    try {
      const nextStatus = await apiRequest<PaymentStatus>("/api/payments/status", accessToken);
      setStatus(nextStatus);
      onEntitlementChangeRef.current(nextStatus.entitlement?.active ? nextStatus.entitlement.tier : null);
    } catch (error) {
      onNoticeRef.current(error instanceof Error ? error.message : "Badge purchase status could not be loaded.", "error");
    } finally {
      setLoadingStatus(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const available = Boolean(window.Talent7Billing?.isAvailable());
    setNativeBilling(available);
    if (available) {
      window.Talent7Billing?.queryProducts(JSON.stringify(supporterProducts.map((product) => product.googlePlayProductId)));
    }

    const handleProducts = (event: Event) => {
      const details = (event as CustomEvent<{ products?: NativeProductDetail[] }>).detail;
      const prices = (details?.products || []).reduce<Record<string, string>>((result, product) => {
        if (product.productId && product.formattedPrice) result[product.productId] = product.formattedPrice;
        return result;
      }, {});
      setNativePrices(prices);
    };
    const handlePurchase = async (event: Event) => {
      const detail = (event as CustomEvent<NativePurchaseDetail>).detail || {};
      if (detail.state === "PENDING") {
        setActionKey("");
        onNoticeRef.current("Google Play payment is pending. Your badge will appear only after payment completes.", "warning");
        await refreshStatus();
        return;
      }
      if (detail.state === "CANCELLED") {
        setActionKey("");
        onNoticeRef.current("Google Play checkout was cancelled.", "info");
        return;
      }
      if (detail.state === "ERROR") {
        setActionKey("");
        onNoticeRef.current(detail.message || "Google Play checkout could not be completed.", "error");
        return;
      }
      if (detail.state !== "PURCHASED" || !detail.productId || !detail.purchaseToken || !accessToken) return;

      try {
        await apiRequest("/api/payments/google-play/verify", accessToken, {
          method: "POST",
          body: JSON.stringify({ productId: detail.productId, purchaseToken: detail.purchaseToken })
        });
        onNoticeRef.current("Google Play purchase verified. Your profile badge is active.", "success");
        await refreshStatus();
      } catch (error) {
        onNoticeRef.current(error instanceof Error ? error.message : "Google Play verification failed.", "error");
      } finally {
        setActionKey("");
      }
    };

    window.addEventListener("talent7-native-products", handleProducts);
    window.addEventListener("talent7-native-purchase", handlePurchase);
    return () => {
      window.removeEventListener("talent7-native-products", handleProducts);
      window.removeEventListener("talent7-native-purchase", handlePurchase);
    };
  }, [accessToken, refreshStatus]);

  const highestTier = status.entitlement?.active ? status.entitlement.tier : null;
  const capturedPayments = useMemo(
    () => status.payments.filter((payment) => payment.status === "Captured"),
    [status.payments]
  );

  function requirePaymentLogin() {
    if (accessToken && userId) return true;
    onRequireLogin();
    return false;
  }

  async function startRazorpayCheckout(product: SupporterProduct | null, amountSubunits?: number) {
    if (!requirePaymentLogin() || !accessToken) return;
    const checkoutKey = product?.code || customSupportProductCode;
    setActionKey(checkoutKey);
    try {
      await loadRazorpayScript();
      const order = await apiRequest<{
        amount: number;
        currency: string;
        keyId: string;
        orderId: string;
        productName: string;
      }>("/api/payments/razorpay/order", accessToken, {
        method: "POST",
        body: JSON.stringify({
          productCode: product?.code || customSupportProductCode,
          ...(product ? {} : { amountSubunits })
        })
      });
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Talent7",
        description: order.productName,
        order_id: order.orderId,
        prefill: { email, name: displayName },
        theme: { color: "#17b8aa" },
        modal: { ondismiss: () => setActionKey("") },
        handler: async (response) => {
          try {
            await apiRequest("/api/payments/razorpay/verify", accessToken, {
              method: "POST",
              body: JSON.stringify(response)
            });
            onNotice("Payment verified. Thank you for supporting Talent7.", "success");
            await refreshStatus();
          } catch (error) {
            onNotice(error instanceof Error ? error.message : "The payment could not be verified.", "error");
          } finally {
            setActionKey("");
          }
        }
      });
      checkout.open();
    } catch (error) {
      setActionKey("");
      onNotice(error instanceof Error ? error.message : "Checkout could not start.", "error");
    }
  }

  function purchaseFixedProduct(product: SupporterProduct) {
    if (!requirePaymentLogin() || !userId) return;
    if (nativeBilling) {
      setActionKey(product.code);
      window.Talent7Billing?.purchase(product.googlePlayProductId, userId);
      return;
    }
    void startRazorpayCheckout(product);
  }

  function handleCustomSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requirePaymentLogin()) return;
    const amountInRupees = Number(customAmount);
    const amountSubunits = Math.round(amountInRupees * 100);
    if (
      !Number.isFinite(amountInRupees) ||
      amountSubunits < customSupportMinimumSubunits ||
      amountSubunits > customSupportMaximumSubunits
    ) {
      onNotice("Choose a custom support amount from ₹10 to ₹100,000.", "error");
      return;
    }
    void startRazorpayCheckout(null, amountSubunits);
  }

  return (
    <section className="supporterPayments" aria-labelledby="supporter-payments-title">
      <div className="supporterPaymentsHeader">
        <div>
          <p className="eyebrow">One-time support</p>
          <h3 id="supporter-payments-title">Support Talent7 without a subscription</h3>
          <p>Core challenges stay free. A verified one-time purchase can add your highest qualifying supporter badge permanently.</p>
        </div>
        <div className={`supporterCurrentBadge${highestTier ? " active" : ""}`}>
          <span>{highestTier ? "Active badge" : "Current access"}</span>
          <strong>{highestTier ? supporterTierLabel(highestTier) : "Free member"}</strong>
          <small>{loadingStatus ? "Refreshing…" : highestTier ? "Verified purchase" : "No purchase required"}</small>
        </div>
      </div>

      <div className="supporterTierGrid">
        {supporterProducts.map((product) => (
          <article key={product.code}>
            <span>{product.name}</span>
            <strong>{nativePrices[product.googlePlayProductId] || formatInrSubunits(product.amountSubunits)}</strong>
            <p>{product.description}</p>
            <small>One-time purchase · core features remain free</small>
            <button disabled={Boolean(actionKey)} onClick={() => purchaseFixedProduct(product)} type="button">
              {actionKey === product.code ? "Opening secure checkout…" : `Choose ${product.name}`}
            </button>
          </article>
        ))}
      </div>

      {!nativeBilling && (
        <form className="customSupportForm" onSubmit={handleCustomSupport}>
          <div>
            <span>Custom support amount</span>
            <strong>Choose any amount from ₹10 to ₹100,000.</strong>
            <small>Amounts of ₹99, ₹299, or ₹999 qualify for the matching highest supporter badge.</small>
          </div>
          <label>
            Amount in INR
            <span className="customAmountInput">
              <span aria-hidden="true">₹</span>
              <input
                aria-label="Custom support amount in Indian rupees"
                inputMode="decimal"
                max="100000"
                min="10"
                onChange={(event) => setCustomAmount(event.target.value)}
                step="1"
                type="number"
                value={customAmount}
              />
            </span>
          </label>
          <button disabled={Boolean(actionKey)} type="submit">
            {actionKey === customSupportProductCode ? "Opening secure checkout…" : "Support a custom amount"}
          </button>
        </form>
      )}

      <div className="supporterPaymentActions">
        <small>Payments are verified on Talent7 servers before a badge is granted. Never share payment credentials in chat.</small>
        {nativeBilling && (
          <button disabled={Boolean(actionKey) || !accessToken} onClick={() => window.Talent7Billing?.restorePurchases()} type="button">
            Restore Google Play purchases
          </button>
        )}
        {!nativeBilling && <button disabled={loadingStatus || !accessToken} onClick={() => void refreshStatus()} type="button">Refresh payment status</button>}
      </div>

      {capturedPayments.length > 0 && (
        <details className="supporterPaymentHistory">
          <summary>Payment history ({capturedPayments.length})</summary>
          <div>
            {capturedPayments.slice(0, 10).map((payment) => (
              <article key={payment.id}>
                <span>{supporterProductByCode(payment.product_code)?.name || payment.product_name}</span>
                <strong>{paymentAmount(payment)}</strong>
                <small>{payment.provider} · {new Date(payment.captured_at || payment.created_at).toLocaleDateString()}</small>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
