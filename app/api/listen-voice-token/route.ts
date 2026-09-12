import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";

type TokenRequest = {
  roomId?: unknown;
};

type ListenMemberRole = "Host" | "Speaker" | "Listener";

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
  if (!userAccessToken) return jsonError("Log in to enter this voice room.", 401);

  let body: TokenRequest;
  try {
    body = (await request.json()) as TokenRequest;
  } catch {
    return jsonError("Invalid voice-room request.", 400);
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    return jsonError("Invalid listen room.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(userAccessToken);
  const user = userResult.user;
  if (userError || !user) return jsonError("Your login has expired. Log in again.", 401);

  const [{ data: room, error: roomError }, { data: member, error: memberError }, { data: profile }] = await Promise.all([
    admin
      .from("listen_rooms")
      .select("id,title,status,voice_enabled,area_slug")
      .eq("id", roomId)
      .maybeSingle(),
    admin
      .from("listen_room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin.from("profiles").select("display_name,username").eq("user_id", user.id).maybeSingle()
  ]);

  if (roomError || memberError) return jsonError("The local voice-room migration has not been applied yet.", 503);
  if (!room || room.status !== "Open" || room.voice_enabled !== true) {
    return jsonError("This voice room is not open right now.", 409);
  }
  if (!member) return jsonError("Join the Listen room before entering its voice chat.", 403);

  const role = (["Host", "Speaker", "Listener"] as ListenMemberRole[]).includes(member.role as ListenMemberRole)
    ? (member.role as ListenMemberRole)
    : "Listener";
  const canPublish = role === "Host" || role === "Speaker";
  const participantName = profile?.display_name || profile?.username || "Talent7 member";
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: participantName,
    ttl: "2h",
    metadata: JSON.stringify({ area: room.area_slug, listenRoomId: roomId, role })
  });
  token.addGrant({
    room: `talent7-listen-${roomId}`,
    roomJoin: true,
    canPublish,
    canPublishData: canPublish,
    canSubscribe: true
  });

  return NextResponse.json(
    {
      server_url: livekitUrl,
      participant_token: await token.toJwt(),
      can_publish: canPublish,
      role
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
