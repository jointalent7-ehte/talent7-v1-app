import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PushEvent = {
  id: string;
  user_id: string;
  category: "Challenge invite" | "Challenge update" | "Live room" | "Voting" | "Proof and result" | "Social" | "Weekly summary";
  title: string;
  body: string;
  href: string;
};

type WebhookBody = {
  type?: string;
  table?: string;
  schema?: string;
  record?: PushEvent;
};

const encoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyBytes(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function firebaseAccessToken(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("Firebase service-account authentication failed.");
  }
  return result.access_token as string;
}

function preferenceColumn(category: PushEvent["category"]) {
  if (category === "Challenge invite") return "challenge_invites";
  if (category === "Challenge update") return "challenge_updates";
  if (category === "Live room") return "live_rooms";
  if (category === "Voting") return "voting_windows";
  if (category === "Proof and result") return "proof_results";
  if (category === "Weekly summary") return "weekly_summary";
  return "social_updates";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  if (!webhookSecret || request.headers.get("x-push-webhook-secret") !== webhookSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
  const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey || !firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    return jsonResponse({ error: "Push delivery secrets are incomplete." }, 503);
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const event = body.record;
  if (body.type !== "INSERT" || body.schema !== "public" || body.table !== "push_notification_events" || !event?.id) {
    return jsonResponse({ error: "Unsupported webhook payload" }, 400);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [{ data: preferences }, { data: devices, error: deviceError }] = await Promise.all([
    service.from("notification_preferences").select("*").eq("user_id", event.user_id).maybeSingle(),
    service.from("push_devices").select("id, token").eq("user_id", event.user_id).eq("enabled", true)
  ]);

  if (deviceError) return jsonResponse({ error: "Could not load recipient devices." }, 500);

  const preference = preferenceColumn(event.category);
  if (preferences?.push_enabled === false || preferences?.[preference] === false || !devices?.length) {
    await service.from("push_notification_events").update({ delivered_at: new Date().toISOString() }).eq("id", event.id);
    return jsonResponse({ delivered: 0, skipped: true });
  }

  try {
    const accessToken = await firebaseAccessToken(firebaseClientEmail, firebasePrivateKey);
    let delivered = 0;
    const invalidDeviceIds: string[] = [];
    const deliveryErrors: string[] = [];

    for (const device of devices) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8"
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: event.title, body: event.body },
              data: {
                href: event.href,
                notificationEventId: event.id,
                category: event.category
              },
              android: {
                priority: "high",
                notification: {
                  channel_id: "talent7_updates",
                  click_action: "OPEN_TALENT7_NOTIFICATION"
                }
              }
            }
          })
        }
      );

      if (response.ok) {
        delivered += 1;
        continue;
      }

      const errorText = await response.text();
      deliveryErrors.push(`FCM ${response.status}: ${errorText.slice(0, 300)}`);
      if (response.status === 404 || errorText.includes("UNREGISTERED") || errorText.includes("INVALID_ARGUMENT")) {
        invalidDeviceIds.push(device.id);
      }
    }

    if (invalidDeviceIds.length) {
      await service.from("push_devices").update({ enabled: false, updated_at: new Date().toISOString() }).in("id", invalidDeviceIds);
    }

    if (delivered === 0 && devices.length > 0) {
      throw new Error(deliveryErrors[0] || "Firebase did not accept the push notification.");
    }

    await service
      .from("push_notification_events")
      .update({
        delivered_at: new Date().toISOString(),
        delivery_attempts: 1,
        last_delivery_error: deliveryErrors.length ? deliveryErrors.join(" | ").slice(0, 500) : null
      })
      .eq("id", event.id);

    return jsonResponse({ delivered, disabledDevices: invalidDeviceIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push delivery failed.";
    await service
      .from("push_notification_events")
      .update({ delivery_attempts: 1, last_delivery_error: message.slice(0, 500) })
      .eq("id", event.id);
    return jsonResponse({ error: message }, 500);
  }
});
