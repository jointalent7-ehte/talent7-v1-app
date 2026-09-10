import { NextResponse } from "next/server";
import { paymentJsonError, paymentServiceClient } from "../../../../../lib/payment-server";
import { reconcilePayUPayment, type PayUPaymentRecord } from "../../../../../lib/payu-payment-processing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("txnid") || "";
  const paymentRecordId = url.searchParams.get("payment_id") || "";
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(transactionId) || !/^[a-f0-9-]{36}$/i.test(paymentRecordId)) {
    return paymentJsonError("The payment return reference was invalid.", 400);
  }

  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);
  const { data, error } = await service
    .from("payments")
    .select("id, amount_subunits, currency, product_name, provider_order_id, status")
    .eq("id", paymentRecordId)
    .eq("provider", "PayU")
    .eq("provider_order_id", transactionId)
    .maybeSingle();
  if (error || !data) return paymentJsonError("The payment return reference was not found.", 404);

  try {
    const outcome = await reconcilePayUPayment(service, data as PayUPaymentRecord);
    return NextResponse.json({ outcome }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ outcome: "pending" }, { headers: { "Cache-Control": "no-store" } });
  }
}
