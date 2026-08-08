import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function tokensMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const expectedToken = process.env.SENTRY_TEST_TOKEN;
  const receivedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

  if (!expectedToken || !tokensMatch(receivedToken, expectedToken)) {
    return new NextResponse(null, { status: 404 });
  }

  const eventId = Sentry.captureException(new Error("Talent7 controlled Sentry verification"), {
    tags: {
      verification: "sentry-production"
    }
  });

  await Sentry.flush(2000);

  return NextResponse.json({ ok: true, eventId });
}
