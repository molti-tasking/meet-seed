import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { archiveVault, getSessionThread } from "@/lib/agents";
import { recordUsage } from "@/lib/usage";

// Poll a code-change request: fetch the agent's thread + lifecycle and persist
// it (PR URL, pending question, or error). Returns the request + live thread.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;

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

  // Terminal states need no further polling.
  if (request.status === "merged" || request.status === "failed") {
    return NextResponse.json({ request, entries: [] });
  }

  let thread;
  try {
    thread = await getSessionThread(request.sessionId);
  } catch (err) {
    return NextResponse.json(
      {
        request,
        entries: [],
        warning: err instanceof Error ? err.message : "Could not poll session",
      },
      { status: 200 }
    );
  }

  const wasActive = request.status === "running" || request.status === "needs_input";
  const nowTerminalish = thread.status === "needs_review" || thread.status === "failed";

  // On the transition into a terminal-ish state, record the agent's token usage
  // (once) and archive the per-run vault.
  if (wasActive && nowTerminalish) {
    await recordUsage(id, "coding_agent", "claude-opus-4-8", thread.usage);
    if (request.vaultId) await archiveVault(request.vaultId);
  }

  const [updated] = await db
    .update(schema.codeChangeRequests)
    .set({
      status: thread.status,
      prUrl: thread.prUrl ?? null,
      prNumber: thread.prNumber ?? null,
      error: thread.error ?? null,
      question: thread.question ?? null,
    })
    .where(eq(schema.codeChangeRequests.id, reqId))
    .returning();

  return NextResponse.json({ request: updated, entries: thread.entries });
}
