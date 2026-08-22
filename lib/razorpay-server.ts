import { createHmac, timingSafeEqual } from "node:crypto";

export type RazorpayOrder = {
  amount: number;
  amount_due: number;
  amount_paid: number;
  attempts: number;
  created_at: number;
  currency: string;
  entity: "order";
  id: string;
  notes?: Record<string, string>;
  offer_id?: string | null;
  receipt?: string;
  status: "created" | "attempted" | "paid";
};

export type RazorpayPayment = {
  amount: number;
  captured: boolean;
  currency: string;
  error_code?: string | null;
  error_description?: string | null;
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
};

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export function razorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

function basicAuthorization(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64")}`;
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}) {
  const config = razorpayConfig();
  if (!config) throw new Error("Razorpay is not configured.");

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: basicAuthorization(config.keyId, config.keySecret),
      "Content-Type": "application/json",
      ...init.headers
    },
    cache: "no-store"
  });
  const body = (await response.json()) as T & { error?: { description?: string } };
  if (!response.ok) throw new Error(body.error?.description || "Razorpay rejected the request.");
  return body;
}

export function createRazorpayOrder(input: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) {
  return razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function fetchRazorpayOrder(orderId: string) {
  return razorpayRequest<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export function fetchRazorpayPayment(paymentId: string) {
  return razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

function signaturesMatch(expectedHex: string, receivedHex: string) {
  if (!/^[a-f0-9]+$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const config = razorpayConfig();
  if (!config) return false;
  const expected = createHmac("sha256", config.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return signaturesMatch(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = razorpayWebhookSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return signaturesMatch(expected, signature);
}
