import { NextResponse } from "next/server";
import { cashfreeAmountSubunits, verifyCashfreeSandboxWebhook } from "../../../../../lib/cashfree-server";
import {
  paymentJsonError,
  paymentServiceClient,
  sha256Hex
} from "../../../../../lib/payment-server";

export const runtime = "nodejs";

type CashfreeWebhook = {
  data?: {
    error_details?: { error_code?: string; error_description?: string } | null;
    order?: { order_amount?: number; order_currency?: string; order_id?: string };
    payment?: {
      cf_payment_id?: string;
      payment_message?: string;
      payment_status?: string;
    };
  };
  event_time?: string;
  type?: string;
};

export async function POST(request: Request) {
  if (process.env.CASHFREE_MODE?.trim().toLowerCase() !== "sandbox") {
    return paymentJsonError("Cashfree sandbox webhooks are disabled.", 503);
  }
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  const signature = request.headers.get("x-webhook-signature") || "";
  if (!verifyCashfreeSandboxWebhook(rawBody, timestamp, signature)) {
    return paymentJsonError("Cashfree webhook signature verification failed.", 401);
  }
  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);

  let webhook: CashfreeWebhook;
  try {
    webhook = JSON.parse(rawBody) as CashfreeWebhook;
  } catch {
    return paymentJsonError("The Cashfree webhook payload was invalid.", 400);
  }

  const eventType = String(webhook.type || "");
  const order = webhook.data?.order || {};
  const payment = webhook.data?.payment || {};
  const errorDetails = webhook.data?.error_details || {};
  const orderId = String(order.order_id || "");
  const providerPaymentId = String(payment.cf_payment_id || "");
  const eventId = request.headers.get("x-idempotency-key")
    || sha256Hex(`${eventType}|${providerPaymentId}|${webhook.event_time || timestamp}`);

  const { data: existingEvent } = await service
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "Cashfree")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (existingEvent) {
    return NextResponse.json({ accepted: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { data: paymentRecord } = orderId
      ? await service
        .from("payments")
        .select("id, amount_subunits, currency, status")
        .eq("provider", "Cashfree")
        .eq("provider_order_id", orderId)
        .maybeSingle()
      : { data: null };

    if (paymentRecord && eventType === "PAYMENT_SUCCESS_WEBHOOK") {
      const amountMatches = cashfreeAmountSubunits(order.order_amount) === Number(paymentRecord.amount_subunits);
      const currencyMatches = String(order.order_currency || "") === paymentRecord.currency;
      if (!amountMatches || !currencyMatches || payment.payment_status !== "SUCCESS" || !providerPaymentId) {
        throw new Error("Cashfree success webhook did not match the Talent7 order.");
      }
      const { error } = await service.from("payments").update({
        provider_payment_id: providerPaymentId,
        status: "Authorized",
        verified_at: new Date().toISOString(),
        captured_at: null,
        failure_code: null,
        failure_description: null,
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
    } else if (paymentRecord && paymentRecord.status !== "Captured" && eventType === "PAYMENT_FAILED_WEBHOOK") {
      const { error } = await service.from("payments").update({
        provider_payment_id: providerPaymentId || null,
        status: "Failed",
        failure_code: String(errorDetails.error_code || "").slice(0, 120) || null,
        failure_description: String(errorDetails.error_description || payment.payment_message || "").slice(0, 500) || null,
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
    } else if (paymentRecord && paymentRecord.status !== "Captured" && eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
      const { error } = await service.from("payments").update({
        provider_payment_id: providerPaymentId || null,
        status: "Cancelled",
        failure_description: "Cashfree sandbox checkout was closed before payment completed.",
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
    }

    const { error: eventError } = await service.from("payment_webhook_events").insert({
      provider: "Cashfree",
      provider_event_id: eventId,
      event_type: eventType || "unknown"
    });
    if (eventError && eventError.code !== "23505") throw new Error(eventError.message);

    return NextResponse.json(
      { accepted: true, matched: Boolean(paymentRecord), sandbox: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The Cashfree webhook could not be processed.", 502);
  }
}
