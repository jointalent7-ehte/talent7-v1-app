import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  createR2PresignedUrl,
  getR2Config,
  publicR2Url,
  r2KeyFromPublicUrl,
  type R2MediaKind
} from "../../../lib/r2";

export const runtime = "nodejs";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const maxPhotoBytes = 10 * 1024 * 1024;
const maxVideoBytes = 50 * 1024 * 1024;
const mediaKinds = new Set<R2MediaKind>(["challenge-proofs", "showcase-media"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function authenticatedUser(request: Request) {
  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  return { client, user: data.user };
}

function safePathPart(value: unknown, fallback: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export async function POST(request: Request) {
  if (!getR2Config()) return jsonError("Cloudflare R2 is not configured.", 503);

  const authenticated = await authenticatedUser(request);
  if (!authenticated) return jsonError("Sign in again before uploading media.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("The upload request was invalid.", 400);
  }

  const kind = String(body.kind || "") as R2MediaKind;
  const contentType = String(body.contentType || "").trim().toLowerCase();
  const size = Number(body.size);
  if (!mediaKinds.has(kind)) return jsonError("Unknown media destination.", 400);
  if (!Number.isSafeInteger(size) || size <= 0) return jsonError("Invalid file size.", 400);

  const isImage = allowedImageTypes.has(contentType);
  const isVideo = allowedVideoTypes.has(contentType);
  if (!isImage && !isVideo) return jsonError("Only JPG, PNG, WebP, MP4, and MOV files are allowed.", 415);
  if (isImage && size > maxPhotoBytes) return jsonError("Photos must be 10 MB or smaller.", 413);
  if (isVideo && size > maxVideoBytes) return jsonError("Videos must be 50 MB or smaller.", 413);

  const folder = safePathPart(body.folder, kind === "showcase-media" ? "showcase" : "proof");
  const fileName = safePathPart(body.fileName, "upload");
  const key = `${kind}/${authenticated.user.id}/${folder}/${crypto.randomUUID()}-${fileName}`;
  const uploadUrl = createR2PresignedUrl({ method: "PUT", key, contentType, expiresInSeconds: 300 });

  return NextResponse.json(
    { uploadUrl, publicUrl: publicR2Url(key), expiresInSeconds: 300 },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: Request) {
  if (!getR2Config()) return jsonError("Cloudflare R2 is not configured.", 503);

  const authenticated = await authenticatedUser(request);
  if (!authenticated) return jsonError("Sign in again before deleting media.", 401);

  let mediaUrl = "";
  try {
    const body = (await request.json()) as { mediaUrl?: unknown };
    mediaUrl = String(body.mediaUrl || "");
  } catch {
    return jsonError("The delete request was invalid.", 400);
  }

  const key = r2KeyFromPublicUrl(mediaUrl);
  if (!key) return NextResponse.json({ managed: false, deleted: false }, { headers: { "Cache-Control": "no-store" } });

  const keyParts = key.split("/");
  const ownerUserId = keyParts[1] || "";
  let canDelete = ownerUserId === authenticated.user.id;

  if (!canDelete) {
    const { data } = await authenticated.client
      .from("app_admins")
      .select("user_id")
      .eq("user_id", authenticated.user.id)
      .maybeSingle();
    canDelete = Boolean(data);
  }

  if (!canDelete) return jsonError("You do not have permission to delete this media.", 403);

  const deleteUrl = createR2PresignedUrl({ method: "DELETE", key, expiresInSeconds: 60 });
  const response = await fetch(deleteUrl, { method: "DELETE", cache: "no-store" });
  if (!response.ok && response.status !== 404) return jsonError("R2 could not delete the media file.", 502);

  return NextResponse.json({ managed: true, deleted: true }, { headers: { "Cache-Control": "no-store" } });
}

