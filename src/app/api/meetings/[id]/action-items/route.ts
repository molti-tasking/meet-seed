import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateActionItems } from "@/lib/ai";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actionItems = await db
    .select()
    .from(schema.actionItems)
    .where(eq(schema.actionItems.meetingId, id))
    .orderBy(desc(schema.actionItems.createdAt));
  return NextResponse.json({ actionItems });
}

// Assemble the meeting's transcript + context, ask Claude for structured action
// items, and persist them.
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

  const [transcript, context] = await Promise.all([
    db
      .select()
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.meetingId, id))
      .orderBy(asc(schema.transcriptSegments.startTs)),
    db
      .select()
      .from(schema.contextItems)
      .where(eq(schema.contextItems.meetingId, id))
      .orderBy(asc(schema.contextItems.createdAt)),
  ]);

  let generated;
  try {
    generated = await generateActionItems(id, {
      title: meeting.title,
      transcript: transcript.map((t) => ({
        speakerLabel: t.speakerLabel,
        text: t.text,
      })),
      context: context.map((c) => ({ type: c.type, content: c.content })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate action items",
      },
      { status: 502 }
    );
  }

  if (generated.length === 0) {
    return NextResponse.json({ actionItems: [] }, { status: 201 });
  }

  const created = await db
    .insert(schema.actionItems)
    .values(
      generated.map((item) => ({
        meetingId: id,
        title: item.title,
        description: item.description,
        fileRefs: JSON.stringify(item.fileRefs ?? []),
        priority: item.priority ?? "medium",
      }))
    )
    .returning();

  return NextResponse.json({ actionItems: created }, { status: 201 });
}
