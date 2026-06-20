import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/config";

// Reports which integrations are configured (booleans only — no secrets).
// Handy for debugging a deploy: curl https://<domain>/api/health
export async function GET() {
  return NextResponse.json({ ok: true, integrations: integrationStatus() });
}
