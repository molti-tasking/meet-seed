import { NextResponse } from "next/server";
import { asc, desc, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Fetch a meeting and all its captured context. `id` may be either the
// meeting's cuid or its roomName, so the meeting page can resolve from the URL.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(or(eq(schema.meetings.id, id), eq(schema.meetings.roomName, id)))
    .limit(1);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const [transcript, context, actionItems] = await Promise.all([
    db
      .select()
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.meetingId, meeting.id))
      .orderBy(asc(schema.transcriptSegments.startTs)),
    db
      .select()
      .from(schema.contextItems)
      .where(eq(schema.contextItems.meetingId, meeting.id))
      .orderBy(asc(schema.contextItems.createdAt)),
    db
      .select()
      .from(schema.actionItems)
      .where(eq(schema.actionItems.meetingId, meeting.id))
      .orderBy(desc(schema.actionItems.createdAt)),
  ]);

  return NextResponse.json({ meeting: { ...meeting, transcript, context, actionItems } });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Partial<typeof schema.meetings.$inferInsert> = {};
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.language === "string") data.language = body.language;
  if (typeof body.githubRepoUrl === "string")
    data.githubRepoUrl = body.githubRepoUrl.trim() || null;
  // Bind a (possibly inherited) GitHub App installation to this meeting so
  // indexing and coding agents can authenticate against the chosen repo.
  if (typeof body.githubInstallationId === "string")
    data.githubInstallationId = body.githubInstallationId.trim() || null;

  const [meeting] = await db
    .update(schema.meetings)
    .set(data)
    .where(eq(schema.meetings.id, id))
    .returning();

  return NextResponse.json({ meeting });
}
