import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

// Mint a short-lived LiveKit JWT scoped to a single room + participant.
export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit credentials are not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const roomName = (body.roomName ?? "").toString().trim();
  const name = (body.name ?? "").toString().trim() || "Guest";
  // Stable, unique identity per joiner — also used as the transcript speaker key.
  const identity =
    (body.identity ?? "").toString().trim() ||
    `${name}-${Math.random().toString(36).slice(2, 8)}`;

  if (!roomName) {
    return NextResponse.json({ error: "roomName is required" }, { status: 400 });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: "2h" });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({
    token,
    identity,
    name,
    serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null,
  });
}
