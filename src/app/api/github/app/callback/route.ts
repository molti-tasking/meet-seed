import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyState } from "@/lib/githubApp";

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
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const [meeting] = await db
    .update(schema.meetings)
    .set({ githubInstallationId: installationId })
    .where(eq(schema.meetings.id, meetingId))
    .returning();

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // The connect flow runs in a popup; land on a page that signals the opener and
  // closes itself (falls back to a link back into the meeting).
  return NextResponse.redirect(
    new URL(`/github/connected?room=${encodeURIComponent(meeting.roomName)}`, url.origin)
  );
}
