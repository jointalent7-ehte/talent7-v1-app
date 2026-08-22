import { NextResponse } from "next/server";
import { processGooglePlaySupporterPurchase } from "../../../../../lib/google-play-payment-processing";
import { paymentJsonError, paymentServiceClient, sha256Hex } from "../../../../../lib/payment-server";
import { supporterProductByGooglePlayId } from "../../../../../lib/supporter-products";

export const runtime = "nodejs";

type PubSubEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
  };
};

type GooglePlayNotification = {
  packageName?: string;
  oneTimeProductNotification?: {
    purchaseToken?: string;
    sku?: string;
  };
};

export async function POST(request: Request) {
  const expectedToken = process.env.GOOGLE_PLAY_RTDN_TOKEN?.trim();
  const receivedToken = new URL(request.url).searchParams.get("token") || "";
  if (!expectedToken || sha256Hex(receivedToken) !== sha256Hex(expectedToken)) {
    return paymentJsonError("Google Play notification authentication failed.", 401);
  }
  const service = paymentServiceClient();
  if (!service) return paymentJsonError("Payment services are not configured.", 503);

  let envelope: PubSubEnvelope;
  try {
    envelope = (await request.json()) as PubSubEnvelope;
  } catch {
    return paymentJsonError("The Google Play notification was invalid.", 400);
  }
  const messageId = String(envelope.message?.messageId || "");
  const encodedData = String(envelope.message?.data || "");
  if (!messageId || !encodedData) return paymentJsonError("The Google Play notification was incomplete.", 400);

  let notification: GooglePlayNotification;
  try {
    notification = JSON.parse(Buffer.from(encodedData, "base64").toString("utf8")) as GooglePlayNotification;
  } catch {
    return paymentJsonError("The Google Play notification payload was invalid.", 400);
  }
  const productId = String(notification.oneTimeProductNotification?.sku || "");
  const purchaseToken = String(notification.oneTimeProductNotification?.purchaseToken || "");
  if (notification.packageName !== "com.jointalent7.app" || !supporterProductByGooglePlayId(productId) || !purchaseToken) {
    return NextResponse.json({ accepted: true, relevant: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: existingEvent } = await service
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "Google Play")
    .eq("provider_event_id", messageId)
    .maybeSingle();
  if (existingEvent) {
    return NextResponse.json({ accepted: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await processGooglePlaySupporterPurchase({ service, productId, purchaseToken });
    if (!result.known) {
      return NextResponse.json({ accepted: true, known: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const { error } = await service.from("payment_webhook_events").insert({
      provider: "Google Play",
      provider_event_id: messageId,
      event_type: "oneTimeProductNotification"
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    return NextResponse.json({ accepted: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentJsonError(error instanceof Error ? error.message : "The Google Play notification could not be processed.", 502);
  }
}
