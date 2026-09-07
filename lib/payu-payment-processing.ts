import type { SupabaseClient } from "@supabase/supabase-js";
import { grantSupporterEntitlement } from "./payment-server";
import { payuAmountSubunits, verifyPayUPayment } from "./payu-server";

export type PayUPaymentRecord = {
  amount_subunits: number;
  currency: string;
  id: string;
  product_name: string;
  provider_order_id: string | null;
  status: string;
};

export type PayUReconcileResult = "captured" | "authorized" | "pending" | "cancelled" | "failed";

export async function reconcilePayUPayment(service: SupabaseClient, paymentRecord: PayUPaymentRecord): Promise<PayUReconcileResult> {
  const transactionId = String(paymentRecord.provider_order_id || "");
  if (!transactionId) throw new Error("The PayU transaction reference is missing.");
  const providerPayment = await verifyPayUPayment(transactionId);
  const status = String(providerPayment.status || "").toLowerCase();
  const unmappedStatus = String(providerPayment.unmappedStatus || providerPayment.unmappedstatus || "").toLowerCase();
  const providerPaymentId = String(providerPayment.mihpayId || "") || null;
  const amountSubunits = payuAmountSubunits(providerPayment.originalAmount ?? providerPayment.amount);
  const currency = String(providerPayment.originalCurrency || paymentRecord.currency).toUpperCase();
  const productMatches = !providerPayment.productInfo || providerPayment.productInfo === paymentRecord.product_name;
  const recordMatches = !providerPayment.udf1 || providerPayment.udf1 === paymentRecord.id;

  if (status === "success" && unmappedStatus === "captured") {
    if (
      amountSubunits !== Number(paymentRecord.amount_subunits)
      || currency !== paymentRecord.currency
      || !productMatches
      || !recordMatches
    ) {
      throw new Error("The PayU payment did not match the Talent7 order.");
    }
    const now = new Date().toISOString();
    const { error } = await service.from("payments").update({
      provider_payment_id: providerPaymentId,
      status: "Captured",
      verified_at: now,
      captured_at: now,
      failure_code: null,
      failure_description: null,
      updated_at: now
    }).eq("id", paymentRecord.id);
    if (error) throw new Error(error.message);
    await grantSupporterEntitlement(service, paymentRecord.id);
    return "captured";
  }

  if (paymentRecord.status === "Captured" || paymentRecord.status === "Refunded") {
    return paymentRecord.status === "Captured" ? "captured" : "failed";
  }

  let result: PayUReconcileResult;
  if (status === "success" && unmappedStatus === "auth") result = "authorized";
  else if (["initiated", "in progress", "pending"].includes(unmappedStatus) || status === "pending") result = "pending";
  else if (["usercancelled", "usercancelledbycustomer"].includes(unmappedStatus)) result = "cancelled";
  else result = "failed";

  const { error } = await service.from("payments").update({
    provider_payment_id: providerPaymentId,
    status: result === "authorized" ? "Authorized" : result === "pending" ? "Pending" : result === "cancelled" ? "Cancelled" : "Failed",
    verified_at: new Date().toISOString(),
    failure_code: result === "failed" ? String(providerPayment.errorCode || "").slice(0, 120) || null : null,
    failure_description: result === "failed"
      ? String(providerPayment.errorMessage || providerPayment.field9 || "PayU reported that the payment failed.").slice(0, 500)
      : null,
    updated_at: new Date().toISOString()
  }).eq("id", paymentRecord.id);
  if (error) throw new Error(error.message);
  return result;
}

