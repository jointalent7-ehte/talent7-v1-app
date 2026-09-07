import { createHash } from "node:crypto";

export type PayUMode = "test" | "production";

export type PayUVerifiedPayment = {
  amount?: number | string;
  errorCode?: string;
  errorMessage?: string;
  field9?: string;
  mihpayId?: number | string;
  originalAmount?: number | string;
  originalCurrency?: string;
  productInfo?: string;
  status?: string;
  txnId?: string;
  udf1?: string | null;
  unmappedStatus?: string;
  unmappedstatus?: string;
};

type PayUCreateResponse = {
  message?: string;
  orderId?: string;
  result?: { checkoutUrl?: string };
  status?: number | string;
};

type PayUVerifyResponse = {
  message?: string;
  result?: PayUVerifiedPayment[];
  status?: number;
};

export function payuConfig() {
  const mode = process.env.PAYU_MODE?.trim().toLowerCase();
  const merchantKey = process.env.PAYU_MERCHANT_KEY?.trim();
  const merchantSalt = process.env.PAYU_MERCHANT_SALT?.trim();
  if ((mode !== "test" && mode !== "production") || !merchantKey || !merchantSalt) return null;
  return {
    createUrl: mode === "production" ? "https://api.payu.in/v2/payments" : "https://apitest.payu.in/v2/payments",
    merchantKey,
    merchantSalt,
    mode: mode as PayUMode,
    verifyUrl: mode === "production" ? "https://info.payu.in/v3/transaction" : "https://test.payu.in/v3/transaction"
  };
}

export function payuCallbackUrl() {
  const configured = process.env.PAYU_CALLBACK_URL?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const candidate = configured || (siteUrl ? `${siteUrl.replace(/\/$/, "")}/api/payu` : "");
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function payuAuthorization(body: string, date: string, merchantKey: string, merchantSalt: string) {
  const signature = createHash("sha512")
    .update(`${body}|${date}|${merchantSalt}`, "utf8")
    .digest("hex");
  return `hmac username="${merchantKey}", algorithm="sha512", headers="date", signature="${signature}"`;
}

async function payuJsonRequest<T>(url: string, bodyValue: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const config = payuConfig();
  if (!config) throw new Error("PayU checkout is not configured.");
  const body = JSON.stringify(bodyValue);
  const date = new Date().toUTCString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      date,
      authorization: payuAuthorization(body, date, config.merchantKey, config.merchantSalt),
      ...extraHeaders
    },
    body,
    cache: "no-store"
  });
  const raw = await response.text();
  let parsed: T & { message?: string };
  try {
    parsed = JSON.parse(raw) as T & { message?: string };
  } catch {
    throw new Error(response.ok ? "PayU returned an unreadable response." : "PayU rejected the request.");
  }
  if (!response.ok) throw new Error(parsed.message || "PayU rejected the request.");
  return parsed;
}

export async function createPayUHostedPayment(input: {
  amountSubunits: number;
  callbackUrl: string;
  currency: string;
  customerEmail: string;
  customerName?: string;
  customerPhone: string;
  paymentRecordId: string;
  productCode: string;
  productName: string;
  transactionId: string;
}) {
  const config = payuConfig();
  if (!config) throw new Error("PayU checkout is not configured.");
  const nameParts = (input.customerName || "Talent7 member").trim().split(/\s+/);
  const firstName = (nameParts.shift() || "Talent7").slice(0, 60);
  const lastName = nameParts.join(" ").slice(0, 20);
  const response = await payuJsonRequest<PayUCreateResponse>(config.createUrl, {
    accountId: config.merchantKey,
    txnId: input.transactionId,
    currency: input.currency,
    paymentSource: "WEB",
    order: {
      productInfo: input.productName,
      orderedItem: [{
        itemId: input.productCode,
        description: input.productName,
        quantity: 1
      }],
      userDefinedFields: {
        udf1: input.paymentRecordId,
        udf2: input.productCode
      },
      paymentChargeSpecification: {
        price: (input.amountSubunits / 100).toFixed(2)
      }
    },
    billingDetails: {
      firstName,
      lastName,
      email: input.customerEmail,
      phone: input.customerPhone,
      address1: "Not applicable - digital delivery",
      country: "India"
    },
    callBackActions: {
      successAction: input.callbackUrl,
      failureAction: input.callbackUrl,
      cancelAction: input.callbackUrl
    },
    additionalInfo: {
      txnFlow: "nonseamless",
      createOrder: true
    }
  });
  const checkoutUrl = String(response.result?.checkoutUrl || "");
  if (!checkoutUrl.startsWith("https://")) {
    throw new Error(response.message || "PayU did not return a secure checkout URL.");
  }
  return { checkoutUrl, status: String(response.status || "PENDING") };
}

export async function verifyPayUPayment(transactionId: string) {
  const config = payuConfig();
  if (!config) throw new Error("PayU checkout is not configured.");
  const response = await payuJsonRequest<PayUVerifyResponse>(
    config.verifyUrl,
    { txnId: [transactionId] },
    { "Info-Command": "verify_payment" }
  );
  const payment = response.result?.find((item) => String(item.txnId || "") === transactionId)
    || response.result?.[0];
  if (!payment || String(payment.txnId || "") !== transactionId) {
    throw new Error("PayU has not found this transaction yet.");
  }
  return payment;
}

export function payuAmountSubunits(amount: unknown) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const subunits = Math.round(numeric * 100);
  return Number.isSafeInteger(subunits) ? subunits : null;
}

export function normalizePayUPhone(value: unknown) {
  const normalized = String(value || "").trim().replace(/[\s()-]/g, "").replace(/^\+/, "");
  return /^[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

