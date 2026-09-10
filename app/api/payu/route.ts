import { NextResponse } from "next/server";

export const runtime = "nodejs";

function returnUrl(outcome: string, identifiers?: PayUReturnIdentifiers) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.jointalent7.com";
  const url = new URL(siteUrl);
  url.pathname = "/payment-return";
  url.search = "";
  url.searchParams.set("provider", "payu");
  url.searchParams.set("payment", outcome);
  if (identifiers?.transactionId && /^[A-Za-z0-9_-]{1,50}$/.test(identifiers.transactionId)) {
    url.searchParams.set("txnid", identifiers.transactionId);
  }
  if (identifiers?.paymentRecordId && /^[a-f0-9-]{36}$/i.test(identifiers.paymentRecordId)) {
    url.searchParams.set("payment_id", identifiers.paymentRecordId);
  }
  return url;
}

type PayUReturnIdentifiers = { paymentRecordId: string; transactionId: string };

function handlePayUReturn(identifiers: PayUReturnIdentifiers) {
  // Return control to the customer immediately. The visible return page checks
  // PayU separately, so a slow provider response cannot strand this POST.
  return NextResponse.redirect(returnUrl("pending", identifiers), 303);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let values: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      values = await request.json() as Record<string, unknown>;
    } else {
      const body = await request.formData();
      values = Object.fromEntries(body.entries());
    }
  } catch {
    // The callback URL contains Talent7's references, so an unreadable provider body does not block reconciliation.
  }
  return handlePayUReturn({
    transactionId: String(
      url.searchParams.get("txnid")
      || url.searchParams.get("txnId")
      || values.txnid
      || values.txnId
      || values.referenceId
      || values.reference_id
      || ""
    ),
    paymentRecordId: String(url.searchParams.get("udf1") || values.udf1 || "")
  });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  return handlePayUReturn({
    transactionId: url.searchParams.get("txnid")
      || url.searchParams.get("txnId")
      || url.searchParams.get("referenceId")
      || "",
    paymentRecordId: url.searchParams.get("udf1") || ""
  });
}
