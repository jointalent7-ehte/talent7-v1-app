import { NextResponse } from "next/server";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";
import {
  createPayUHostedPayment,
  normalizePayUPhone,
  payuCallbackUrl,
  payuConfig
} from "../../../../../lib/payu-server";
import { supporterProductByCode } from "../../../../../lib/supporter-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    process.env.WEBSITE_PAYMENTS_ENABLED !== "true"
    || process.env.WEB_PAYMENT_PROVIDER?.trim().toLowerCase() !== "payu"
  ) {
    return paymentJsonError("PayU checkout is disabled.", 503);
  }

  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before starting checkout.", 401);
  const service = paymentServiceClient();
  const config = payuConfig();
  const callbackUrl = payuCallbackUrl();
  if (!service || !config || !callbackUrl) return paymentJsonError("PayU checkout is not configured yet.", 503);

  const body = await paymentRequestBody(request);
  if (!body) return paymentJsonError("The checkout request was invalid.", 400);
  const fixedProduct = supporterProductByCode(String(body.productCode || ""));
  if (!fixedProduct) return paymentJsonError("Choose one of the fixed Talent7 badge products.", 400);
  const customerPhone = normalizePayUPhone(body.customerPhone);
  if (!customerPhone) return paymentJsonError("Enter a valid phone number, including country code when required.", 400);
  if (!authenticated.user.email) return paymentJsonError("A verified email address is required for PayU checkout.", 400);

  const { data: payment, error: insertError } = await service
    .from("payments")
    .insert({
      user_id: authenticated.user.id,
      provider: "PayU",
      product_code: fixedProduct.code,
      product_name: fixedProduct.name,
      amount_subunits: fixedProduct.amountSubunits,
      currency: fixedProduct.currency,
      status: "Creating"
    })
    .select("id")
    .single();
  if (insertError || !payment) {
    return paymentJsonError(insertError?.message || "The payment record could not be created.", 400);
  }

  const paymentRecordId = String(payment.id);
  const transactionId = `t7${paymentRecordId.replaceAll("-", "")}`;
  const transactionCallbackUrl = new URL(callbackUrl);
  transactionCallbackUrl.searchParams.set("txnid", transactionId);
  transactionCallbackUrl.searchParams.set("udf1", paymentRecordId);
  const metadata = authenticated.user.user_metadata || {};
  const customerName = String(metadata.full_name || metadata.name || "").trim().slice(0, 80) || undefined;

  try {
    const order = await createPayUHostedPayment({
      amountSubunits: fixedProduct.amountSubunits,
      callbackUrl: transactionCallbackUrl.toString(),
      currency: fixedProduct.currency,
      customerEmail: authenticated.user.email,
      customerName,
      customerPhone,
      paymentRecordId,
      productCode: fixedProduct.code,
      productName: fixedProduct.name,
      transactionId
    });
    const { error: updateError } = await service.from("payments").update({
      provider_order_id: transactionId,
      status: "Created",
      updated_at: new Date().toISOString()
    }).eq("id", paymentRecordId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      { checkoutUrl: order.checkoutUrl, paymentRecordId, productName: fixedProduct.name, test: config.mode === "test" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    await service.from("payments").update({
      status: "Failed",
      failure_description: error instanceof Error ? error.message.slice(0, 500) : "Order creation failed.",
      updated_at: new Date().toISOString()
    }).eq("id", paymentRecordId);
    return paymentJsonError(error instanceof Error ? error.message : "PayU could not create the order.", 502);
  }
}
