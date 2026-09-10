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

const temporaryCustomAmountMinimumInr = 1;
const temporaryCustomAmountMaximumInr = 100;

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
  const requestedProductCode = String(body.productCode || "");
  const fixedProduct = supporterProductByCode(requestedProductCode);
  const temporaryCustomAmountsEnabled = process.env.TEMPORARY_PAYU_CUSTOM_AMOUNTS_ENABLED === "true";
  const requestedAmountInr = Number(body.amountInr);
  const validCustomAmount = temporaryCustomAmountsEnabled
    && requestedProductCode === "custom_support"
    && Number.isInteger(requestedAmountInr)
    && requestedAmountInr >= temporaryCustomAmountMinimumInr
    && requestedAmountInr <= temporaryCustomAmountMaximumInr;
  if (!fixedProduct && !validCustomAmount) {
    return paymentJsonError(
      temporaryCustomAmountsEnabled
        ? `Enter a whole-rupee test amount from ₹${temporaryCustomAmountMinimumInr} to ₹${temporaryCustomAmountMaximumInr}.`
        : "Choose one of the fixed Talent7 badge products.",
      400
    );
  }
  const productCode = fixedProduct?.code || "custom_support";
  const productName = fixedProduct?.name || "Custom Talent7 support";
  const amountSubunits = fixedProduct?.amountSubunits || requestedAmountInr * 100;
  const currency = fixedProduct?.currency || "INR";
  const customerPhone = normalizePayUPhone(body.customerPhone);
  if (!customerPhone) return paymentJsonError("Enter a valid phone number, including country code when required.", 400);
  if (!authenticated.user.email) return paymentJsonError("A verified email address is required for PayU checkout.", 400);

  const { data: payment, error: insertError } = await service
    .from("payments")
    .insert({
      user_id: authenticated.user.id,
      provider: "PayU",
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
  const transactionId = `t7${paymentRecordId.replaceAll("-", "")}`;
  // PayU's hosted mobile return does not consistently echo the transaction
  // reference in the callback body. Keep the transaction ID in the return URL
  // so Talent7 can always perform server-side verification after checkout.
  const transactionCallbackUrl = new URL(callbackUrl);
  transactionCallbackUrl.searchParams.set("txnid", transactionId);
  const metadata = authenticated.user.user_metadata || {};
  const customerName = String(metadata.full_name || metadata.name || "").trim().slice(0, 80) || undefined;

  try {
    const order = await createPayUHostedPayment({
      amountSubunits,
      callbackUrl: transactionCallbackUrl.toString(),
      currency,
      customerEmail: authenticated.user.email,
      customerName,
      customerPhone,
      paymentRecordId,
      productCode,
      productName,
      transactionId
    });
    const { error: updateError } = await service.from("payments").update({
      provider_order_id: transactionId,
      status: "Created",
      updated_at: new Date().toISOString()
    }).eq("id", paymentRecordId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json(
      { checkoutUrl: order.checkoutUrl, paymentRecordId, productName, test: config.mode === "test" },
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
