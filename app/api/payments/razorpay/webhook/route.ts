import { NextResponse } from "next/server";
import {
  grantSupporterEntitlement,
  paymentJsonError,
  paymentServiceClient,
  reconcileSupporterEntitlement,
  sha256Hex
} from "../../../../../lib/payment-server";
import { verifyRazorpayWebhookSignature } from "../../../../../lib/razorpay-server";

export const runtime = "nodejs";

type RazorpayWebhook = {
  created_at?: number;
  event?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    refund?: { entity?: Record<string, unknown> };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return paymentJsonError("Razorpay webhook signature verification failed.", 401);
  }
  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);

  let webhook: RazorpayWebhook;
  try {
    webhook = JSON.parse(rawBody) as RazorpayWebhook;
  } catch {
    return paymentJsonError("The Razorpay webhook payload was invalid.", 400);
  }
  const eventType = String(webhook.event || "");
  const payment = webhook.payload?.payment?.entity || {};
  const refund = webhook.payload?.refund?.entity || {};
  const paymentId = String(payment.id || refund.payment_id || "");
  const orderId = String(payment.order_id || "");
  const eventId = request.headers.get("x-razorpay-event-id")
    || sha256Hex(`${eventType}|${paymentId}|${webhook.created_at || ""}`);

  const { data: existingEvent } = await service
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "Razorpay")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (existingEvent) {
    return NextResponse.json({ accepted: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    let paymentRecord: { id: string; user_id: string | null } | null = null;
    if (orderId) {
      const { data } = await service
        .from("payments")
        .select("id, user_id")
        .eq("provider", "Razorpay")
        .eq("provider_order_id", orderId)
        .maybeSingle();
      paymentRecord = data;
    } else if (paymentId) {
      const { data } = await service
        .from("payments")
        .select("id, user_id")
        .eq("provider", "Razorpay")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();
      paymentRecord = data;
    }

    if (paymentRecord && (eventType === "payment.captured" || eventType === "order.paid")) {
      const { error } = await service.from("payments").update({
        provider_payment_id: paymentId || null,
        status: "Captured",
        verified_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        failure_code: null,
        failure_description: null,
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
      await grantSupporterEntitlement(service, paymentRecord.id);
    } else if (paymentRecord && eventType === "payment.failed") {
      const { error } = await service.from("payments").update({
        provider_payment_id: paymentId || null,
        status: "Failed",
        failure_code: String(payment.error_code || "").slice(0, 120) || null,
        failure_description: String(payment.error_description || "").slice(0, 500) || null,
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
    } else if (paymentRecord && (eventType === "refund.processed" || eventType === "payment.refunded")) {
      const { error } = await service.from("payments").update({
        status: "Refunded",
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", paymentRecord.id);
      if (error) throw new Error(error.message);
      if (paymentRecord.user_id) await reconcileSupporterEntitlement(service, paymentRecord.user_id);
    }

    const { error: eventError } = await service.from("payment_webhook_events").insert({
      provider: "Razorpay",
      provider_event_id: eventId,
      event_type: eventType || "unknown"
    });
    if (eventError && eventError.code !== "23505") throw new Error(eventError.message);

    return NextResponse.json(
      { accepted: true, matched: Boolean(paymentRecord) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The Razorpay webhook could not be processed.", 502);
  }
}
