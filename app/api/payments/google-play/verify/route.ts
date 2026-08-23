import { NextResponse } from "next/server";
import { processGooglePlaySupporterPurchase } from "../../../../../lib/google-play-payment-processing";
import {
  authenticatedPaymentRequest,
  paymentJsonError,
  paymentRequestBody,
  paymentServiceClient
} from "../../../../../lib/payment-server";
import { supporterProductByGooglePlayId } from "../../../../../lib/supporter-products";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authenticated = await authenticatedPaymentRequest(request);
  if (!authenticated) return paymentJsonError("Sign in again before verifying the Google Play purchase.", 401);
  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);
  const body = await paymentRequestBody(request);
  if (!body) return paymentJsonError("The Google Play purchase response was invalid.", 400);

  const productId = String(body.productId || "");
  const purchaseToken = String(body.purchaseToken || "");
  if (!supporterProductByGooglePlayId(productId)) return paymentJsonError("Unknown Google Play digital badge product.", 400);
  if (purchaseToken.length < 20 || purchaseToken.length > 4096) return paymentJsonError("The Google Play purchase token was invalid.", 400);

  try {
    const result = await processGooglePlaySupporterPurchase({
      service,
      productId,
      purchaseToken,
      expectedUserId: authenticated.user.id
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "Google Play verification failed.", 502);
  }
}
