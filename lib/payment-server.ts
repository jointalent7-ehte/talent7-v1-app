import { createHash } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type AuthenticatedPaymentRequest = {
  client: SupabaseClient;
  user: User;
  token: string;
};

export function paymentJsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

export async function authenticatedPaymentRequest(request: Request): Promise<AuthenticatedPaymentRequest | null> {
  const token = bearerToken(request);
  const config = publicSupabaseConfig();
  if (!token || !config) return null;

  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { client, user: data.user, token };
}

export function paymentServiceClient() {
  const config = publicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !serviceRoleKey) return null;

  return createClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function paymentRequestBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function grantSupporterEntitlement(service: SupabaseClient, paymentId: string) {
  const { error } = await service.rpc("reconcile_supporter_entitlement_for_payment", {
    target_payment_id: paymentId
  });
  if (error) throw new Error(error.message || "The supporter badge could not be granted.");
}

export async function reconcileSupporterEntitlement(service: SupabaseClient, userId: string) {
  const { error } = await service.rpc("reconcile_supporter_entitlement", {
    target_user_id: userId
  });
  if (error) throw new Error(error.message || "The supporter badge could not be reconciled.");
}

export function currencySubunitsFromMicros(amountMicros: string | number | undefined, currency: string) {
  const micros = Number(amountMicros);
  if (!Number.isFinite(micros) || micros <= 0) return null;
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
  const divisor = 10 ** Math.max(0, 6 - fractionDigits);
  const subunits = Math.round(micros / divisor);
  return Number.isSafeInteger(subunits) && subunits > 0 ? subunits : null;
}
