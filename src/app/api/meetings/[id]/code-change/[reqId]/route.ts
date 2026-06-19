import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { archiveVault, getSessionResult } from "@/lib/agents";

// Poll a code-change request: if still running, ask Managed Agents for the
// session status and persist the result (PR URL or error) when it finishes.
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
  if (request.status !== "running") {
    return NextResponse.json({ request });
  }

  let result;
  try {
    result = await getSessionResult(request.sessionId);
  } catch (err) {
    return NextResponse.json(
      {
        request,
        warning: err instanceof Error ? err.message : "Could not poll session",
      },
      { status: 200 }
    );
  }

  if (result.status === "running") {
    return NextResponse.json({ request });
  }

  // Terminal: the per-run vault (if any) is no longer needed — archive it.
  if (request.vaultId) await archiveVault(request.vaultId);

  const [updated] = await db
    .update(schema.codeChangeRequests)
    .set({
      status: result.status,
      prUrl: result.prUrl ?? null,
      prNumber: result.prNumber ?? null,
      error: result.error ?? null,
    })
    .where(eq(schema.codeChangeRequests.id, reqId))
    .returning();

  return NextResponse.json({ request: updated });
}
