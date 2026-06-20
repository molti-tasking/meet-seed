import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyState } from "@/lib/githubApp";
import { log } from "@/lib/logger";

// GitHub's App Setup URL points here. After install we get an installation_id
// and our signed state (which binds it to the meeting). Store it and bounce the
// user back into the meeting.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  if (!installationId || !state) {
    return NextResponse.json(
      { error: "Missing installation_id or state" },
      { status: 400 }
    );
  }

  const meetingId = verifyState(state);
  if (!meetingId) {
    log.warn("github/app/callback: invalid state (expired or tampered)");
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }
  log.info("github/app/callback: installation connected", { meetingId, installationId });

  const [meeting] = await db
    .update(schema.meetings)
    .set({ githubInstallationId: installationId })
    .where(eq(schema.meetings.id, meetingId))
    .returning();

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // The connect flow runs in a popup; land on a page that signals the opener and
  // closes itself. Use APP_URL when set, since behind a reverse proxy the request
  // origin can resolve to the internal host (localhost:3000).
  const base = process.env.APP_URL || url.origin;
  return NextResponse.redirect(
    new URL(`/github/connected?room=${encodeURIComponent(meeting.roomName)}`, base)
  );
}
