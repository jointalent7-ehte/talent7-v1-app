import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "talent7",
      checkedAt: new Date().toISOString(),
    },
    { headers: noStoreHeaders },
  );
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: noStoreHeaders,
  });
}
