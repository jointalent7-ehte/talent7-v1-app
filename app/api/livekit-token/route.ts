import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";

type TokenRequest = {
  challengeId?: unknown;
  publish?: unknown;
};

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
    return jsonError("Native live video has not been configured yet.", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const userAccessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!userAccessToken) return jsonError("Log in to enter this native live room.", 401);

  let body: TokenRequest;
  try {
    body = (await request.json()) as TokenRequest;
  } catch {
    return jsonError("Invalid live-room request.", 400);
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const requestedPublish = body.publish === true;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
    return jsonError("Invalid challenge room.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(userAccessToken);
  const user = userResult.user;
  if (userError || !user) return jsonError("Your login has expired. Log in again.", 401);

  const { data: liveSession, error: liveError } = await admin
    .from("challenge_live_sessions")
    .select("challenge_id, provider, livekit_room_name, status")
    .eq("challenge_id", challengeId)
    .maybeSingle();

  if (liveError) return jsonError("The live-room migration has not been applied yet.", 503);
  if (!liveSession || liveSession.provider !== "LiveKit" || liveSession.status !== "Live" || !liveSession.livekit_room_name) {
    return jsonError("This Talent7 room is not live right now.", 409);
  }

  const [{ data: managerResult }, { data: challengerJoin }, { data: profile }] = await Promise.all([
    admin.rpc("can_manage_challenge_live", {
      target_challenge_id: challengeId,
      target_user_id: user.id
    }),
    admin
      .from("challenge_joins")
      .select("id")
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .eq("role", "Challenger")
      .limit(1)
      .maybeSingle(),
    admin.from("profiles").select("display_name, username").eq("user_id", user.id).maybeSingle()
  ]);

  const canPublish = requestedPublish && (managerResult === true || Boolean(challengerJoin));
  const participantName = profile?.display_name || profile?.username || "Talent7 member";
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: participantName,
    ttl: "2h",
    metadata: JSON.stringify({ challengeId, role: canPublish ? "challenger" : "audience" })
  });
  token.addGrant({
    room: liveSession.livekit_room_name,
    roomJoin: true,
    canPublish,
    canPublishData: canPublish,
    canSubscribe: true
  });

  return NextResponse.json(
    {
      server_url: livekitUrl,
      participant_token: await token.toJwt(),
      can_publish: canPublish
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
