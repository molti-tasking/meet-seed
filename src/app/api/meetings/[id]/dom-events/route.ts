import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// Persist a batch of rrweb events captured from the in-app shared surface.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const events = body.events;

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { error: "events must be a non-empty array" },
      { status: 400 }
    );
  }

  const [recording] = await db
    .insert(schema.domRecordings)
    .values({ meetingId: id, events: JSON.stringify(events) })
    .returning({ id: schema.domRecordings.id });

  return NextResponse.json({ id: recording.id, count: events.length }, { status: 201 });
}
