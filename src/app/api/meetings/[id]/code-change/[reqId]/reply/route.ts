import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sendToSession } from "@/lib/agents";

// Send a message into a running/idle agent — answers a pending question or
// steers work in progress. Either way it goes back to "running".
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = (body.message ?? "").toString().trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const [request] = await db
    .select()
    .from(schema.codeChangeRequests)
    .where(
      and(
        eq(schema.codeChangeRequests.id, reqId),
        eq(schema.codeChangeRequests.meetingId, id)
      )
    )
    .limit(1);

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status === "merged" || request.status === "failed") {
    return NextResponse.json(
      { error: "This run has finished and can no longer receive messages" },
      { status: 400 }
    );
  }

  try {
    await sendToSession(request.sessionId, message);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 502 }
    );
  }

  const [updated] = await db
    .update(schema.codeChangeRequests)
    .set({ status: "running", question: null })
    .where(eq(schema.codeChangeRequests.id, reqId))
    .returning();

  return NextResponse.json({ request: updated });
}
