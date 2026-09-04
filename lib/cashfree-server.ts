import { createHmac, timingSafeEqual } from "node:crypto";

const cashfreeApiVersion = "2026-01-01";

export type CashfreeOrder = {
  cf_order_id: string;
  order_amount: number;
  order_currency: string;
  order_id: string;
  order_status: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED";
  payment_session_id: string;
};

export type CashfreePayment = {
  cf_payment_id: string;
  error_details?: {
    error_code?: string;
    error_description?: string;
  } | null;
  is_captured?: boolean;
  order_amount: number;
  order_currency: string;
  order_id: string;
  payment_amount: number;
  payment_currency: string;
  payment_message?: string;
  payment_status: "SUCCESS" | "NOT_ATTEMPTED" | "FAILED" | "USER_DROPPED" | "VOID" | "CANCELLED" | "PENDING";
};

export function cashfreeSandboxConfig() {
  const mode = process.env.CASHFREE_MODE?.trim().toLowerCase();
  const clientId = process.env.CASHFREE_CLIENT_ID?.trim();
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET?.trim();
  if (mode !== "sandbox" || !clientId || !clientSecret) return null;
  return { clientId, clientSecret, mode: "sandbox" as const };
}

async function cashfreeRequest<T>(path: string, init: RequestInit = {}) {
  const config = cashfreeSandboxConfig();
  if (!config) throw new Error("Cashfree sandbox checkout is not configured.");

  const response = await fetch(`https://sandbox.cashfree.com/pg${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": cashfreeApiVersion,
      "x-client-id": config.clientId,
      "x-client-secret": config.clientSecret,
      ...init.headers
    },
    cache: "no-store"
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || "Cashfree rejected the sandbox request.");
  return body;
}

export function createCashfreeSandboxOrder(input: {
  amountSubunits: number;
  currency: string;
  customerEmail?: string;
  customerId: string;
  customerName?: string;
  orderId: string;
  paymentRecordId: string;
  productCode: string;
  productName: string;
}) {
  return cashfreeRequest<CashfreeOrder>("/orders", {
    method: "POST",
    headers: {
      "x-idempotency-key": input.paymentRecordId
    },
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: input.amountSubunits / 100,
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail || undefined,
        customer_phone: "9999999999",
        customer_name: input.customerName || undefined
      },
      order_note: `${input.productName} sandbox checkout`,
      order_tags: {
        talent7_payment_id: input.paymentRecordId,
        product_code: input.productCode,
        environment: "sandbox"
      }
    })
  });
}

export function fetchCashfreeSandboxOrder(orderId: string) {
  return cashfreeRequest<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export function fetchCashfreeSandboxPayments(orderId: string) {
  return cashfreeRequest<CashfreePayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`);
}

export function verifyCashfreeSandboxWebhook(rawBody: string, timestamp: string, signature: string) {
  const config = cashfreeSandboxConfig();
  if (!config || !timestamp || !signature) return false;
  const expected = createHmac("sha256", config.clientSecret)
    .update(`${timestamp}${rawBody}`, "utf8")
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function cashfreeAmountSubunits(amount: unknown) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const subunits = Math.round(numeric * 100);
  return Number.isSafeInteger(subunits) ? subunits : null;
}
