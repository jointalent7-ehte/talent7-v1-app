import { NextResponse } from "next/server";
import { createCashfreeSandboxOrder, cashfreeSandboxConfig } from "../../../../../lib/cashfree-server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";
import { supporterProductByCode } from "../../../../../lib/supporter-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    process.env.WEBSITE_PAYMENTS_ENABLED !== "true"
    || process.env.WEB_PAYMENT_PROVIDER?.trim().toLowerCase() !== "cashfree"
  ) {
    return paymentJsonError("Cashfree sandbox checkout is disabled.", 503);
  }

  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before starting checkout.", 401);

  const service = paymentServiceClient();
  const config = cashfreeSandboxConfig();
  if (!service || !config) return paymentJsonError("Cashfree sandbox checkout is not configured yet.", 503);

  const body = await paymentRequestBody(request);
  if (!body) return paymentJsonError("The checkout request was invalid.", 400);

  const requestedCode = String(body.productCode || "");
  const fixedProduct = supporterProductByCode(requestedCode);
  if (!fixedProduct) return paymentJsonError("Choose one of the fixed Talent7 badge products.", 400);

  const amountSubunits = fixedProduct.amountSubunits;
  const productCode = fixedProduct.code;
  const productName = fixedProduct.name;
  const currency = fixedProduct.currency;
  const { data: payment, error: insertError } = await service
    .from("payments")
    .insert({
      user_id: authenticated.user.id,
      provider: "Cashfree",
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

  const paymentRecordId = String(payment.id);
  const orderId = `t7_${paymentRecordId.replaceAll("-", "")}`;
  const metadata = authenticated.user.user_metadata || {};
  const customerName = String(metadata.full_name || metadata.name || "").trim().slice(0, 80) || undefined;

  try {
    const order = await createCashfreeSandboxOrder({
      amountSubunits,
      currency,
      customerEmail: authenticated.user.email,
      customerId: authenticated.user.id.replaceAll("-", ""),
      customerName,
      orderId,
      paymentRecordId,
      productCode,
      productName
    });
    const { error: updateError } = await service
      .from("payments")
      .update({
        provider_order_id: order.order_id,
        status: "Created",
        updated_at: new Date().toISOString()
      })
      .eq("id", paymentRecordId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      {
        paymentRecordId,
        paymentSessionId: order.payment_session_id,
        orderId: order.order_id,
        productCode,
        productName,
        sandbox: true
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
      .eq("id", paymentRecordId);
    return paymentJsonError(error instanceof Error ? error.message : "Cashfree could not create the sandbox order.", 502);
  }
}
