import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createR2PresignedUrl, r2KeyFromPublicUrl } from "../../../lib/r2";

export const runtime = "nodejs";

type AuthenticatedRequest = {
  client: SupabaseClient;
  user: User;
};

type DeletionRequestRow = {
  id: string;
  user_id: string | null;
  account_email: string | null;
  reason: string | null;
  status: "Pending" | "In review" | "Deleting" | "Completed" | "Cancelled" | "Rejected";
  eligible_after: string;
};

function jsonError(message: string, status: number) {
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

async function authenticatedRequest(request: Request): Promise<AuthenticatedRequest | null> {
  const token = bearerToken(request);
  const config = publicSupabaseConfig();
  if (!token || !config) return null;

  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : { client, user: data.user };
}

function serviceClient() {
  const config = publicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config || !serviceRoleKey) return null;

  return createClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function isAdmin(authenticated: AuthenticatedRequest) {
  const { data } = await authenticated.client
    .from("app_admins")
    .select("user_id")
    .eq("user_id", authenticated.user.id)
    .maybeSingle();
  return Boolean(data);
}

async function requestBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authenticated = await authenticatedRequest(request);
  if (!authenticated) return jsonError("Sign in again before requesting account deletion.", 401);

  const body = await requestBody(request);
  if (!body) return jsonError("The deletion request was invalid.", 400);

  const password = String(body.password || "");
  const confirmation = String(body.confirmation || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim();
  const email = authenticated.user.email;
  if (!email) return jsonError("This account does not have an email address to verify.", 400);
  if (!password) return jsonError("Enter your current password.", 400);
  if (confirmation !== "DELETE") return jsonError("Type DELETE to confirm the request.", 400);
  if (reason.length > 500) return jsonError("The optional reason must be 500 characters or fewer.", 400);

  const config = publicSupabaseConfig();
  if (!config) return jsonError("Account services are not configured.", 503);
  const verificationClient = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const verification = await verificationClient.auth.signInWithPassword({ email, password });
  if (verification.error || verification.data.user?.id !== authenticated.user.id) {
    return jsonError("Your current password was not accepted.", 403);
  }

  const { data, error } = await authenticated.client.rpc("request_account_deletion", {
    request_reason: reason || null
  });
  if (error) return jsonError(error.message || "The deletion request could not be saved.", 400);

  return NextResponse.json({ request: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const authenticated = await authenticatedRequest(request);
  if (!authenticated) return jsonError("Sign in again before cancelling account deletion.", 401);

  const body = await requestBody(request);
  const requestId = String(body?.requestId || "");
  if (!requestId) return jsonError("Choose a deletion request to cancel.", 400);

  const { data, error } = await authenticated.client.rpc("cancel_account_deletion", { request_id: requestId });
  if (error) return jsonError(error.message || "The deletion request could not be cancelled.", 400);

  return NextResponse.json({ request: data }, { headers: { "Cache-Control": "no-store" } });
}

async function markRequest(
  service: SupabaseClient,
  requestId: string,
  values: Record<string, unknown>,
  expectedStatuses?: string[]
) {
  let query = service.from("account_deletion_requests").update({
    ...values,
    updated_at: new Date().toISOString()
  }).eq("id", requestId);
  if (expectedStatuses?.length) query = query.in("status", expectedStatuses);
  return query.select("*").single();
}

async function mediaUrlsForUser(service: SupabaseClient, userId: string) {
  const [ownedChallenges, ownProofs, showcasePosts] = await Promise.all([
    service.from("challenges").select("id").eq("created_by", userId),
    service.from("proofs").select("proof_url").eq("user_id", userId),
    service.from("showcase_posts").select("media_url").eq("user_id", userId)
  ]);

  const firstError = ownedChallenges.error || ownProofs.error || showcasePosts.error;
  if (firstError) throw new Error("Account media records could not be prepared for cleanup.");

  const challengeIds = (ownedChallenges.data || []).map((row) => String(row.id));
  const challengeProofs = challengeIds.length
    ? await service.from("proofs").select("proof_url").in("challenge_id", challengeIds)
    : { data: [], error: null };
  if (challengeProofs.error) throw new Error("Challenge proof records could not be prepared for cleanup.");

  return Array.from(new Set([
    ...(ownProofs.data || []).map((row) => String(row.proof_url || "")),
    ...(challengeProofs.data || []).map((row) => String(row.proof_url || "")),
    ...(showcasePosts.data || []).map((row) => String(row.media_url || ""))
  ].filter(Boolean)));
}

async function deleteManagedMedia(urls: string[]) {
  for (const mediaUrl of urls) {
    const key = r2KeyFromPublicUrl(mediaUrl);
    if (!key) continue;

    const deleteUrl = createR2PresignedUrl({ method: "DELETE", key, expiresInSeconds: 60 });
    const response = await fetch(deleteUrl, { method: "DELETE", cache: "no-store" });
    if (!response.ok && response.status !== 404) {
      throw new Error("Cloudflare R2 could not remove all account media.");
    }
  }
}

async function deleteSupabaseStoragePrefix(service: SupabaseClient, bucket: string, userId: string) {
  const files: string[] = [];

  async function walk(path: string, depth: number) {
    if (depth > 8) throw new Error("Supabase Storage account folders are nested too deeply to clean safely.");

    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.storage.from(bucket).list(path, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) throw new Error(`Supabase Storage could not list the ${bucket} account folder.`);

      const entries = data || [];
      for (const entry of entries) {
        const entryPath = `${path}/${entry.name}`;
        if (entry.id) files.push(entryPath);
        else await walk(entryPath, depth + 1);
      }
      if (entries.length < 1000) break;
    }
  }

  await walk(userId, 0);
  for (let index = 0; index < files.length; index += 100) {
    const { error } = await service.storage.from(bucket).remove(files.slice(index, index + 100));
    if (error) throw new Error(`Supabase Storage could not remove all ${bucket} account files.`);
  }
}

export async function PATCH(request: Request) {
  const authenticated = await authenticatedRequest(request);
  if (!authenticated) return jsonError("Sign in again before reviewing deletion requests.", 401);
  if (!(await isAdmin(authenticated))) return jsonError("Only a Talent7 admin can review deletion requests.", 403);

  const service = serviceClient();
  if (!service) return jsonError("Add SUPABASE_SERVICE_ROLE_KEY before using the deletion admin workflow.", 503);

  const body = await requestBody(request);
  const requestId = String(body?.requestId || "");
  const action = String(body?.action || "");
  if (!requestId || !["review", "reject", "complete"].includes(action)) {
    return jsonError("Choose a valid deletion request action.", 400);
  }

  const { data: deletionRequest, error: loadError } = await service
    .from("account_deletion_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (loadError || !deletionRequest) return jsonError("Deletion request not found.", 404);
  const row = deletionRequest as DeletionRequestRow;
  if (row.user_id === authenticated.user.id) return jsonError("The owner account cannot delete itself.", 400);

  const reviewStamp = {
    reviewed_by: authenticated.user.id,
    reviewed_at: new Date().toISOString(),
    last_error: null
  };

  if (action === "review") {
    const result = await markRequest(service, requestId, { ...reviewStamp, status: "In review" }, ["Pending"]);
    if (result.error) return jsonError("The request could not be moved into review.", 409);
    return NextResponse.json({ request: result.data }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "reject") {
    const result = await markRequest(service, requestId, { ...reviewStamp, status: "Rejected" }, ["Pending", "In review"]);
    if (result.error) return jsonError("The request could not be rejected.", 409);
    return NextResponse.json({ request: result.data }, { headers: { "Cache-Control": "no-store" } });
  }

  if (row.status !== "In review") return jsonError("Move this request into review before completing it.", 409);
  if (new Date(row.eligible_after).getTime() > Date.now()) {
    return jsonError("The seven-day cancellation window has not ended yet.", 409);
  }
  if (!row.user_id) return jsonError("This request no longer has an account to delete.", 409);

  const deleting = await markRequest(service, requestId, { ...reviewStamp, status: "Deleting" }, ["In review"]);
  if (deleting.error) return jsonError("Another admin action changed this request. Refresh and try again.", 409);

  try {
    const urls = await mediaUrlsForUser(service, row.user_id);
    await deleteManagedMedia(urls);
    await deleteSupabaseStoragePrefix(service, "challenge-proofs", row.user_id);
    await deleteSupabaseStoragePrefix(service, "showcase-media", row.user_id);

    const { error: deleteUserError } = await service.auth.admin.deleteUser(row.user_id, false);
    if (deleteUserError) throw new Error("Supabase could not remove the account and its database records.");

    const completed = await markRequest(service, requestId, {
      ...reviewStamp,
      status: "Completed",
      account_email: null,
      completed_at: new Date().toISOString()
    }, ["Deleting"]);
    if (completed.error) throw new Error("The account was deleted, but the request audit status could not be completed.");

    return NextResponse.json({ request: completed.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account deletion did not finish.";
    await markRequest(service, requestId, { status: "In review", last_error: message.slice(0, 500) }, ["Deleting"]);
    return jsonError(`${message} The request remains in review.`, 502);
  }
}
