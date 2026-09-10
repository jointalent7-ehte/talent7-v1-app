import { NextResponse } from "next/server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentServiceClient
} from "../../../../lib/payment-server";
import { reconcilePayUPayment, type PayUPaymentRecord } from "../../../../lib/payu-payment-processing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again to view badge purchases.", 401);

  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);

  const { data: unsettledPayUPayments } = await service
    .from("payments")
    .select("id, amount_subunits, currency, product_name, provider_order_id, status")
    .eq("user_id", authenticated.user.id)
    .eq("provider", "PayU")
    .in("status", ["Created", "Pending", "Authorized"])
    .not("provider_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (unsettledPayUPayments?.length) {
    await Promise.allSettled(
      unsettledPayUPayments.map((payment) => reconcilePayUPayment(service, payment as PayUPaymentRecord))
    );
  }

  const [entitlementResult, paymentsResult] = await Promise.all([
    service
      .from("supporter_entitlements")
      .select("tier, active, granted_at, updated_at")
      .eq("user_id", authenticated.user.id)
      .maybeSingle(),
    service
      .from("payments")
      .select("id, provider, provider_order_id, product_code, product_name, amount_subunits, currency, status, created_at, captured_at, refunded_at")
      .eq("user_id", authenticated.user.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const error = entitlementResult.error || paymentsResult.error;
  if (error) return paymentJsonError(error.message || "Badge purchase status could not be loaded.", 400);

  return NextResponse.json(
    { entitlement: entitlementResult.data || null, payments: paymentsResult.data || [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
