import { NextResponse } from "next/server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";
import { createRazorpayOrder, razorpayConfig } from "../../../../../lib/razorpay-server";
import {
  customSupportMaximumSubunits,
  customSupportMinimumSubunits,
  customSupportProductCode,
  supporterProductByCode,
  supporterTierForCustomAmount
} from "../../../../../lib/supporter-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before starting checkout.", 401);

  const service = paymentServiceClient();
  const config = razorpayConfig();
  if (!service || !config) return paymentJsonError("Razorpay checkout is not configured yet.", 503);

  const body = await paymentRequestBody(request);
  if (!body) return paymentJsonError("The checkout request was invalid.", 400);

  const requestedCode = String(body.productCode || "");
  const fixedProduct = supporterProductByCode(requestedCode);
  const isCustomSupport = requestedCode === customSupportProductCode;
  const requestedAmountSubunits = Number(body.amountSubunits);
  if (!fixedProduct && !isCustomSupport) return paymentJsonError("Choose a valid supporter option.", 400);
  if (
    isCustomSupport &&
    (!Number.isInteger(requestedAmountSubunits) ||
      requestedAmountSubunits < customSupportMinimumSubunits ||
      requestedAmountSubunits > customSupportMaximumSubunits)
  ) {
    return paymentJsonError("Choose a custom support amount from ₹10 to ₹100,000.", 400);
  }

  const amountSubunits = fixedProduct?.amountSubunits || requestedAmountSubunits;
  const customTier = isCustomSupport ? supporterTierForCustomAmount(amountSubunits) : null;
  const productCode = fixedProduct?.code || customSupportProductCode;
  const productName = fixedProduct?.name || (customTier ? `Custom support (${customTier})` : "Custom support");
  const currency = fixedProduct?.currency || "INR";
  const { data: payment, error: insertError } = await service
    .from("payments")
    .insert({
      user_id: authenticated.user.id,
      provider: "Razorpay",
      product_code: productCode,
      product_name: productName,
      amount_subunits: amountSubunits,
      currency,
      status: "Creating"
    })
    .select("id")
    .single();
  if (insertError || !payment) {
    return paymentJsonError(insertError?.message || "The payment record could not be created.", 400);
  }

  try {
    const order = await createRazorpayOrder({
      amount: amountSubunits,
      currency,
      receipt: `t7_${String(payment.id).replaceAll("-", "").slice(0, 28)}`,
      notes: {
        talent7_payment_id: String(payment.id),
        talent7_user_id: authenticated.user.id,
        product_code: productCode
      }
    });
    const { error: updateError } = await service
      .from("payments")
      .update({
        provider_order_id: order.id,
        status: "Created",
        updated_at: new Date().toISOString()
      })
      .eq("id", payment.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      {
        paymentRecordId: payment.id,
        keyId: config.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        productCode,
        productName
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    await service
      .from("payments")
      .update({
        status: "Failed",
        failure_description: error instanceof Error ? error.message.slice(0, 500) : "Order creation failed.",
        updated_at: new Date().toISOString()
      })
      .eq("id", payment.id);
    return paymentJsonError(error instanceof Error ? error.message : "Razorpay could not create the order.", 502);
  }
}
