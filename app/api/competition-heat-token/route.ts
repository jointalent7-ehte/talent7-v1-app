import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AccessToken, TrackSource } from "livekit-server-sdk";

export const runtime = "nodejs";

type TokenRequest = {
  heatId?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const livekitUrl = process.env.LIVEKIT_URL?.trim();
  const livekitApiKey = process.env.LIVEKIT_API_KEY?.trim();
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!supabaseUrl || !serviceRoleKey || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonError("Tournament live video has not been configured yet.", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const userAccessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!userAccessToken) return jsonError("Log in to enter this competition stage.", 401);

  let body: TokenRequest;
  try {
    body = (await request.json()) as TokenRequest;
  } catch {
    return jsonError("Invalid competition-stage request.", 400);
  }
  const heatId = typeof body.heatId === "string" ? body.heatId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(heatId)) {
    return jsonError("Invalid competition heat.", 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userResult, error: userError } = await admin.auth.getUser(userAccessToken);
  const user = userResult.user;
  if (userError || !user) return jsonError("Your login has expired. Log in again.", 401);

  const [{ data: heat, error: heatError }, { data: adminRow }, { data: registration }, { data: profile }] = await Promise.all([
    admin
      .from("talent7_competition_heats")
      .select("id,status,max_lanes")
      .eq("id", heatId)
      .maybeSingle(),
    admin.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    admin
      .from("talent7_competition_registrations")
      .select("id,display_name,public_anonymous")
      .eq("user_id", user.id),
    admin.from("profiles").select("display_name,username").eq("user_id", user.id).maybeSingle()
  ]);
  if (heatError) return jsonError("The live-heat migration has not been applied yet.", 503);
  if (!heat || !["Ready", "Live"].includes(heat.status)) return jsonError("This competition stage is not open right now.", 409);

  const registrationIds = (registration || []).map((item) => item.id);
  const { data: entry } = registrationIds.length
    ? await admin
        .from("talent7_competition_heat_entries")
        .select("id,lane_number,registration_id,check_in_status")
        .eq("heat_id", heatId)
        .in("registration_id", registrationIds)
        .maybeSingle()
    : { data: null };

  const isOrganizer = Boolean(adminRow);
  const isCompetitor = Boolean(entry);
  if (heat.status === "Ready" && !isOrganizer && !isCompetitor) {
    return jsonError("Audience entry opens when the organizer starts the live heat.", 409);
  }
  if (isCompetitor && entry?.check_in_status !== "Checked in") {
    return jsonError("Check in before entering your live competitor lane.", 409);
  }

  const role = isOrganizer ? "organizer" : isCompetitor ? "competitor" : "audience";
  const ownRegistration = isCompetitor
    ? (registration || []).find((item) => item.id === entry?.registration_id)
    : null;
  const participantName = role === "organizer"
    ? "Talent7 host"
    : ownRegistration?.public_anonymous
      ? `Anonymous competitor · lane ${entry?.lane_number}`
      : ownRegistration?.display_name || profile?.display_name || profile?.username || "Talent7 member";
  const canPublish = role === "organizer" || role === "competitor";
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: participantName,
    ttl: "3h",
    metadata: JSON.stringify({ heatId, role, laneNumber: entry?.lane_number || null })
  });
  token.addGrant({
    room: `talent7-competition-heat-${heatId}`,
    roomJoin: true,
    canPublish,
    canPublishData: canPublish,
    canPublishSources: role === "organizer"
      ? [TrackSource.MICROPHONE]
      : role === "competitor"
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
        : [],
    canSubscribe: true
  });

  return NextResponse.json({
    server_url: livekitUrl,
    participant_token: await token.toJwt(),
    role,
    lane_number: entry?.lane_number || null,
    can_publish: canPublish,
    max_lanes: heat.max_lanes
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
