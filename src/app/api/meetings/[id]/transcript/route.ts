import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// Persist a finalized transcript segment. Called by each participant's browser
// after Deepgram returns a final result for their own mic.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { text, speakerIdentity, speakerLabel, startTs, isFinal } = body;

  if (!text || !speakerIdentity) {
    return NextResponse.json(
      { error: "text and speakerIdentity are required" },
      { status: 400 }
    );
  }

  const [segment] = await db
    .insert(schema.transcriptSegments)
    .values({
      meetingId: id,
      text: text.toString(),
      speakerIdentity: speakerIdentity.toString(),
      speakerLabel: (speakerLabel ?? speakerIdentity).toString(),
      startTs: Number(startTs) || 0,
      isFinal: isFinal !== false,
    })
    .returning();

  return NextResponse.json({ segment }, { status: 201 });
}
