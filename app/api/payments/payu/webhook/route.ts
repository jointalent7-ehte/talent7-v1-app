import { NextResponse } from "next/server";
import { paymentJsonError, paymentServiceClient, sha256Hex } from "../../../../../lib/payment-server";
import { reconcilePayUPayment, type PayUPaymentRecord } from "../../../../../lib/payu-payment-processing";
import { payuConfig } from "../../../../../lib/payu-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = payuConfig();
  if (!config) return paymentJsonError("PayU webhooks are not configured.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return paymentJsonError("The PayU webhook payload was invalid.", 400);
  }
  const transactionId = String(form.get("txnid") || form.get("txnId") || "");
  const merchantKey = String(form.get("key") || "");
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(transactionId) || (merchantKey && merchantKey !== config.merchantKey)) {
    return paymentJsonError("The PayU webhook did not match this merchant.", 401);
  }

  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);
  const providerPaymentId = String(form.get("mihpayid") || "");
  const providerStatus = String(form.get("unmappedstatus") || form.get("status") || "unknown");
  const eventId = sha256Hex(`${transactionId}|${providerPaymentId}|${providerStatus}|${String(form.get("addedon") || "")}`);
  const { data: existingEvent } = await service
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "PayU")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (existingEvent) {
    return NextResponse.json({ accepted: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { data } = await service
      .from("payments")
      .select("id, amount_subunits, currency, product_name, provider_order_id, status")
      .eq("provider", "PayU")
      .eq("provider_order_id", transactionId)
      .maybeSingle();
    let outcome: string | null = null;
    if (data) outcome = await reconcilePayUPayment(service, data as PayUPaymentRecord);

    const { error } = await service.from("payment_webhook_events").insert({
      provider: "PayU",
      provider_event_id: eventId,
      event_type: providerStatus
    });
    if (error && error.code !== "23505") throw new Error(error.message);

    return NextResponse.json(
      { accepted: true, matched: Boolean(data), outcome, test: config.mode === "test" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The PayU webhook could not be processed.", 502);
  }
}

