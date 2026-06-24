import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clusterTranscript } from "@/lib/ai";

// List the meeting's organized transcript topics (latest snapshot).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const topics = await db
    .select()
    .from(schema.transcriptTopics)
    .where(eq(schema.transcriptTopics.meetingId, id))
    .orderBy(asc(schema.transcriptTopics.orderIndex));
  return NextResponse.json({ topics });
}

// Organize the raw transcript into themed topics (terminology corrected against
// the glossary, filler removed) and replace the meeting's stored snapshot.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id))
    .limit(1);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const transcript = await db
    .select()
    .from(schema.transcriptSegments)
    .where(eq(schema.transcriptSegments.meetingId, id))
    .orderBy(asc(schema.transcriptSegments.startTs));

  let glossary: string[] = [];
  try {
    glossary = JSON.parse(meeting.glossary) as string[];
  } catch {
    /* malformed — treat as empty */
  }

  let topics;
  try {
    topics = await clusterTranscript(id, {
      title: meeting.title,
      transcript: transcript.map((t) => ({
        speakerLabel: t.speakerLabel,
        text: t.text,
      })),
      glossary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to organize transcript",
      },
      { status: 502 }
    );
  }

  // Replace the snapshot: delete prior topics, insert the fresh set.
  const created = await db.transaction(async (tx) => {
    await tx
      .delete(schema.transcriptTopics)
      .where(eq(schema.transcriptTopics.meetingId, id));
    if (topics.length === 0) return [];
    return tx
      .insert(schema.transcriptTopics)
      .values(
        topics.map((t, i) => ({
          meetingId: id,
          title: t.title,
          summary: t.summary ?? "",
          points: JSON.stringify(t.points ?? []),
          orderIndex: i,
        }))
      )
      .returning();
  });

  return NextResponse.json({ topics: created }, { status: 201 });
}
