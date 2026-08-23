import { NextResponse } from "next/server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentServiceClient
} from "../../../../lib/payment-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again to view badge purchases.", 401);

  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);

  const [entitlementResult, paymentsResult] = await Promise.all([
    service
      .from("supporter_entitlements")
      .select("tier, active, granted_at, updated_at")
      .eq("user_id", authenticated.user.id)
      .maybeSingle(),
    service
      .from("payments")
      .select("id, provider, product_code, product_name, amount_subunits, currency, status, created_at, captured_at, refunded_at")
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
