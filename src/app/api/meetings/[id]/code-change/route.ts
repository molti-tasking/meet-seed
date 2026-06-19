import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isCodingAgentConfigured, startCodingSession } from "@/lib/agents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requests = await db
    .select()
    .from(schema.codeChangeRequests)
    .where(eq(schema.codeChangeRequests.meetingId, id))
    .orderBy(desc(schema.codeChangeRequests.createdAt));
  return NextResponse.json({ requests });
}

// Kick off a coding agent for this meeting: it implements the meeting's action
// items against the connected repo and opens a pull request.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isCodingAgentConfigured()) {
    return NextResponse.json(
      { error: "Coding agent is not configured (run npm run setup:agent and set AGENT_ID / ENVIRONMENT_ID / VAULT_ID / GITHUB_PAT)" },
      { status: 503 }
    );
  }

  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id))
    .limit(1);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.githubRepoUrl) {
    return NextResponse.json(
      { error: "This meeting has no connected GitHub repository" },
      { status: 400 }
    );
  }

  const items = await db
    .select()
    .from(schema.actionItems)
    .where(eq(schema.actionItems.meetingId, id))
    .orderBy(desc(schema.actionItems.createdAt));
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Generate action items before creating a merge request" },
      { status: 400 }
    );
  }

  const branch = `meeting/${meeting.roomName}-${Math.random().toString(36).slice(2, 7)}`;

  let started: { sessionId: string; vaultId?: string };
  try {
    started = await startCodingSession({
      meetingTitle: meeting.title,
      repoUrl: meeting.githubRepoUrl,
      branch,
      installationId: meeting.githubInstallationId,
      actionItems: items.map((a) => ({
        title: a.title,
        description: a.description,
        fileRefs: safeParseRefs(a.fileRefs),
        priority: a.priority,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start coding agent" },
      { status: 502 }
    );
  }

  const [request] = await db
    .insert(schema.codeChangeRequests)
    .values({
      meetingId: id,
      sessionId: started.sessionId,
      vaultId: started.vaultId ?? null,
      repoUrl: meeting.githubRepoUrl,
      branch,
      status: "running",
    })
    .returning();

  return NextResponse.json({ request }, { status: 201 });
}

function safeParseRefs(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
