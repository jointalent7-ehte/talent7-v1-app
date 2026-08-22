import { NextResponse } from "next/server";
import {
  authenticatedPaymentRequest,
  grantSupporterEntitlement,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpayCheckoutSignature
} from "../../../../../lib/razorpay-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before verifying checkout.", 401);

  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);
  const body = await paymentRequestBody(request);
  if (!body) return paymentJsonError("The payment response was invalid.", 400);

  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) return paymentJsonError("Razorpay returned an incomplete payment response.", 400);

  const { data: paymentRecord, error: lookupError } = await service
    .from("payments")
    .select("id, user_id, amount_subunits, currency, provider_order_id, status")
    .eq("provider", "Razorpay")
    .eq("provider_order_id", orderId)
    .eq("user_id", authenticated.user.id)
    .maybeSingle();
  if (lookupError || !paymentRecord) return paymentJsonError("This Razorpay order does not belong to your account.", 404);
  if (!verifyRazorpayCheckoutSignature(String(paymentRecord.provider_order_id), paymentId, signature)) {
    return paymentJsonError("The Razorpay payment signature was not valid.", 400);
  }

  try {
    const [providerPayment, providerOrder] = await Promise.all([
      fetchRazorpayPayment(paymentId),
      fetchRazorpayOrder(orderId)
    ]);
    const verified =
      providerPayment.order_id === orderId
      && providerPayment.id === paymentId
      && providerPayment.amount === Number(paymentRecord.amount_subunits)
      && providerPayment.currency === paymentRecord.currency
      && providerPayment.status === "captured"
      && providerPayment.captured
      && providerOrder.status === "paid"
      && providerOrder.amount === Number(paymentRecord.amount_subunits)
      && providerOrder.currency === paymentRecord.currency;
    if (!verified) return paymentJsonError("The payment has not been captured yet. Check again shortly.", 409);

    const { error: updateError } = await service
      .from("payments")
      .update({
        provider_payment_id: paymentId,
        status: "Captured",
        verified_at: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        failure_code: null,
        failure_description: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", paymentRecord.id);
    if (updateError) throw new Error(updateError.message);
    await grantSupporterEntitlement(service, String(paymentRecord.id));

    return NextResponse.json(
      { verified: true, paymentRecordId: paymentRecord.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The captured payment could not be verified.", 502);
  }
}
