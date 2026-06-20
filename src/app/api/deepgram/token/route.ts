import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

// Mint a short-lived Deepgram access token so the browser can open a realtime
// transcription WebSocket without ever seeing the long-lived API key.
//
// Uses Deepgram's grant-token endpoint directly (the v5 SDK is a large
// generated client; a plain fetch keeps this stable and dependency-light).
export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    log.warn("deepgram/token: DEEPGRAM_API_KEY not configured — transcription disabled");
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Max TTL is 3600s; comfortably covers a meeting, refreshed on reconnect.
    body: JSON.stringify({ ttl_seconds: 3600 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.error("deepgram/token: grant failed", { status: res.status, detail: detail.slice(0, 200) });
    return NextResponse.json(
      { error: "Failed to mint Deepgram token", detail },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return NextResponse.json({
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  });
}
