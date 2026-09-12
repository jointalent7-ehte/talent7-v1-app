import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const livekitApiKey = process.env.LIVEKIT_API_KEY?.trim();
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!supabaseUrl || !serviceRoleKey || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonError("Talent7 voice rooms have not been configured yet.", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const userAccessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!userAccessToken) return jsonError("Log in to manage this voice room.", 401);

  let body: { roomId?: unknown; userId?: unknown; role?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonError("Invalid voice-role request.", 400);
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const nextRole = body.role === "Speaker" || body.role === "Listener" ? body.role : null;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(roomId) || !uuidPattern.test(targetUserId) || !nextRole) {
    return jsonError("Invalid voice-role request.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(userAccessToken);
  if (userError || !userResult.user) return jsonError("Your login has expired. Log in again.", 401);

  const { data: room, error: roomError } = await admin
    .from("listen_rooms")
    .select("id,created_by,status,voice_enabled")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) return jsonError("The local voice-room migration has not been applied yet.", 503);
  if (!room || room.created_by !== userResult.user.id) return jsonError("Only the room host can manage microphones.", 403);
  if (room.status !== "Open" || room.voice_enabled !== true) return jsonError("This voice room is not open.", 409);

  const { data: member, error: memberError } = await admin
    .from("listen_room_members")
    .select("id,role")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (memberError || !member || member.role === "Host") return jsonError("Listen room member not found.", 404);

  const { error: updateError } = await admin
    .from("listen_room_members")
    .update({ role: nextRole, speaker_requested: false })
    .eq("id", member.id);
  if (updateError) return jsonError("Could not update this member's microphone role.", 500);

  try {
    const livekitApiUrl = livekitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    const rooms = new RoomServiceClient(livekitApiUrl, livekitApiKey, livekitApiSecret);
    await rooms.updateParticipant(`talent7-listen-${roomId}`, targetUserId, {
      metadata: JSON.stringify({ listenRoomId: roomId, role: nextRole }),
      permission: {
        canPublish: nextRole === "Speaker",
        canPublishData: nextRole === "Speaker",
        canSubscribe: true
      }
    });
  } catch {
    // A member who has not entered LiveKit yet has no participant to update.
    // Their next token still receives the newly persisted permission.
  }

  return NextResponse.json({ role: nextRole }, { headers: { "Cache-Control": "no-store" } });
}
