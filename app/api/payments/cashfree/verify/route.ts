import { NextResponse } from "next/server";
import {
  cashfreeAmountSubunits,
  fetchCashfreeSandboxOrder,
  fetchCashfreeSandboxPayments
} from "../../../../../lib/cashfree-server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    process.env.WEBSITE_PAYMENTS_ENABLED !== "true"
    || process.env.WEB_PAYMENT_PROVIDER?.trim().toLowerCase() !== "cashfree"
    || process.env.CASHFREE_MODE?.trim().toLowerCase() !== "sandbox"
  ) {
    return paymentJsonError("Cashfree sandbox verification is disabled.", 503);
  }

  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before verifying checkout.", 401);
  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);
  const body = await paymentRequestBody(request);
  const orderId = String(body?.orderId || "");
  if (!orderId) return paymentJsonError("Cashfree returned an incomplete sandbox response.", 400);

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
      fetchCashfreeSandboxOrder(orderId),
      fetchCashfreeSandboxPayments(orderId)
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
      return paymentJsonError("The Cashfree sandbox payment has not completed successfully yet.", 409);
    }

    const { error: updateError } = await service
      .from("payments")
      .update({
        provider_payment_id: successfulPayment.cf_payment_id,
        status: "Authorized",
        verified_at: new Date().toISOString(),
        captured_at: null,
        failure_code: null,
        failure_description: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", paymentRecord.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      { sandboxVerified: true, paymentRecordId: paymentRecord.id, sandbox: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The Cashfree sandbox payment could not be verified.", 502);
  }
}
