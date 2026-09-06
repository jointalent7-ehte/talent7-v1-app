import { NextResponse } from "next/server";
import {
  cashfreeAmountSubunits,
  cashfreeConfig,
  fetchCashfreeOrder,
  fetchCashfreePayments
} from "../../../../../lib/cashfree-server";
import {
  authenticatedPaymentRequest,
  grantSupporterEntitlement,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    process.env.WEBSITE_PAYMENTS_ENABLED !== "true"
    || process.env.WEB_PAYMENT_PROVIDER?.trim().toLowerCase() !== "cashfree"
  ) {
    return paymentJsonError("Cashfree verification is disabled.", 503);
  }

  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before verifying checkout.", 401);
  const service = paymentServiceClient();
  const config = cashfreeConfig();
  if (!service || !config) return paymentJsonError("Payment services are not configured.", 503);
  const body = await paymentRequestBody(request);
  const orderId = String(body?.orderId || "");
  if (!orderId) return paymentJsonError("Cashfree returned an incomplete response.", 400);

  const { data: paymentRecord, error: lookupError } = await service
    .from("payments")
    .select("id, amount_subunits, currency, provider_order_id, status")
    .eq("provider", "Cashfree")
    .eq("provider_order_id", orderId)
    .eq("user_id", authenticated.user.id)
    .maybeSingle();
  if (lookupError || !paymentRecord) return paymentJsonError("This Cashfree order does not belong to your account.", 404);

  try {
    const [providerOrder, providerPayments] = await Promise.all([
      fetchCashfreeOrder(orderId),
      fetchCashfreePayments(orderId)
    ]);
    const successfulPayment = providerPayments.find((payment) =>
      payment.order_id === orderId
      && payment.payment_status === "SUCCESS"
      && payment.is_captured !== false
    );
    const verified =
      providerOrder.order_id === orderId
      && providerOrder.order_status === "PAID"
      && cashfreeAmountSubunits(providerOrder.order_amount) === Number(paymentRecord.amount_subunits)
      && providerOrder.order_currency === paymentRecord.currency
      && successfulPayment
      && cashfreeAmountSubunits(successfulPayment.order_amount) === Number(paymentRecord.amount_subunits)
      && successfulPayment.order_currency === paymentRecord.currency;
    if (!verified || !successfulPayment) {
      return paymentJsonError("The Cashfree payment has not completed successfully yet.", 409);
    }

    const sandbox = config.mode === "sandbox";
    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from("payments")
      .update({
        provider_payment_id: successfulPayment.cf_payment_id,
        status: sandbox ? "Authorized" : "Captured",
        verified_at: now,
        captured_at: sandbox ? null : now,
        failure_code: null,
        failure_description: null,
        updated_at: now
      })
      .eq("id", paymentRecord.id);
    if (updateError) throw new Error(updateError.message);
    if (!sandbox) await grantSupporterEntitlement(service, String(paymentRecord.id));

    return NextResponse.json(
      { verified: true, paymentRecordId: paymentRecord.id, sandbox },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The Cashfree payment could not be verified.", 502);
  }
}
