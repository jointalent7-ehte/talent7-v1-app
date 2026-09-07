import { NextResponse } from "next/server";
import { paymentServiceClient } from "../../../lib/payment-server";
import { reconcilePayUPayment, type PayUPaymentRecord } from "../../../lib/payu-payment-processing";

export const runtime = "nodejs";

function returnUrl(outcome: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.jointalent7.com";
  const url = new URL(siteUrl);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("provider", "payu");
  url.searchParams.set("payment", outcome);
  url.hash = "plans";
  return url;
}

async function handlePayUReturn(transactionId: string) {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(transactionId)) {
    return NextResponse.redirect(returnUrl("error"), 303);
  }
  const service = paymentServiceClient();
  if (!service) return NextResponse.redirect(returnUrl("error"), 303);
  const { data } = await service
    .from("payments")
    .select("id, amount_subunits, currency, product_name, provider_order_id, status")
    .eq("provider", "PayU")
    .eq("provider_order_id", transactionId)
    .maybeSingle();
  if (!data) return NextResponse.redirect(returnUrl("error"), 303);

  try {
    const outcome = await reconcilePayUPayment(service, data as PayUPaymentRecord);
    return NextResponse.redirect(returnUrl(outcome), 303);
  } catch {
    return NextResponse.redirect(returnUrl("pending"), 303);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    return handlePayUReturn(String(body.get("txnid") || body.get("txnId") || ""));
  } catch {
    return NextResponse.redirect(returnUrl("error"), 303);
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  return handlePayUReturn(url.searchParams.get("txnid") || url.searchParams.get("txnId") || "");
}

