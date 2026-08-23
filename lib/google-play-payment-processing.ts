import type { SupabaseClient } from "@supabase/supabase-js";
import { acknowledgeGooglePlayProduct, fetchGooglePlayProductPurchase } from "./google-play-server";
import {
  currencySubunitsFromMicros,
  grantSupporterEntitlement,
  reconcileSupporterEntitlement,
  sha256Hex
} from "./payment-server";
import { supporterProductByGooglePlayId } from "./supporter-products";

export async function processGooglePlaySupporterPurchase(input: {
  service: SupabaseClient;
  productId: string;
  purchaseToken: string;
  expectedUserId?: string;
}) {
  const product = supporterProductByGooglePlayId(input.productId);
  if (!product) throw new Error("Unknown Google Play digital badge product.");

  const tokenHash = sha256Hex(input.purchaseToken);
  const { data: existing, error: existingError } = await input.service
    .from("payments")
    .select("id, user_id")
    .eq("provider", "Google Play")
    .eq("provider_purchase_token_hash", tokenHash)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const userId = String(existing?.user_id || input.expectedUserId || "");
  if (!userId) return { known: false, status: "Unknown" as const, entitlementGranted: false };
  if (input.expectedUserId && userId !== input.expectedUserId) {
    throw new Error("This Google Play purchase is already linked to another Talent7 account.");
  }

  const { purchase, accessToken } = await fetchGooglePlayProductPurchase(input.productId, input.purchaseToken);
  const expectedObfuscatedAccountId = sha256Hex(userId);
  if (
    input.expectedUserId
    && purchase.obfuscatedExternalAccountId
    && purchase.obfuscatedExternalAccountId !== expectedObfuscatedAccountId
  ) {
    throw new Error("The Google Play account link did not match this Talent7 account.");
  }

  const currency = String(purchase.priceCurrencyCode || product.currency).toUpperCase();
  const amountSubunits = currencySubunitsFromMicros(purchase.priceAmountMicros, currency) || product.amountSubunits;
  const purchaseState = Number(purchase.purchaseState);
  const status = purchaseState === 0 ? "Captured" : purchaseState === 2 ? "Pending" : "Cancelled";
  const now = new Date().toISOString();
  const values = {
    user_id: userId,
    provider: "Google Play",
    product_code: product.code,
    product_name: product.name,
    amount_subunits: amountSubunits,
    currency,
    status,
    provider_product_id: product.googlePlayProductId,
    provider_order_id: purchase.orderId || null,
    provider_payment_id: purchase.orderId || null,
    provider_purchase_token_hash: tokenHash,
    verified_at: now,
    captured_at: status === "Captured" ? now : null,
    updated_at: now
  };

  let paymentId = existing?.id ? String(existing.id) : "";
  if (paymentId) {
    const { error } = await input.service.from("payments").update(values).eq("id", paymentId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await input.service.from("payments").insert(values).select("id").single();
    if (error || !data) throw new Error(error?.message || "The Google Play payment could not be recorded.");
    paymentId = String(data.id);
  }

  if (status === "Captured") {
    await grantSupporterEntitlement(input.service, paymentId);
    if (Number(purchase.acknowledgementState) === 0) {
      await acknowledgeGooglePlayProduct(input.productId, input.purchaseToken, accessToken);
    }
  } else {
    await reconcileSupporterEntitlement(input.service, userId);
  }

  return {
    known: true,
    status,
    entitlementGranted: status === "Captured",
    paymentRecordId: paymentId,
    productCode: product.code,
    tier: product.tier
  };
}
