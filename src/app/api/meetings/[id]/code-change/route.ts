import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isCodingAgentConfigured, startCodingSession } from "@/lib/agents";
import { isEmbeddingConfigured } from "@/lib/embeddings";
import { retrieveRelevantCode } from "@/lib/codebase";
import { synthesizeSpec } from "@/lib/ai";
import { log } from "@/lib/logger";

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

// Kick off a coding agent for this meeting against the connected repo. By
// default it implements the meeting's action items; pass a `featureRequestId`
// to instead implement a single in-meeting product feedback item.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const featureRequestId =
    typeof body.featureRequestId === "string" ? body.featureRequestId : null;

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

  const branch = `meeting/${meeting.roomName}-${Math.random().toString(36).slice(2, 7)}`;

  // The task is either a single feedback item (when targeted) or the meeting's
  // action items.
  let actionItems: {
    title: string;
    description: string;
    fileRefs: string[];
    priority: string;
  }[];
  let featureRequest:
    | typeof schema.featureRequests.$inferSelect
    | undefined;
  if (featureRequestId) {
    [featureRequest] = await db
      .select()
      .from(schema.featureRequests)
      .where(eq(schema.featureRequests.id, featureRequestId))
      .limit(1);
    if (!featureRequest) {
      return NextResponse.json(
        { error: "Feature request not found" },
        { status: 404 }
      );
    }
    actionItems = [
      {
        title: featureRequest.title,
        description: featureRequest.detail || featureRequest.title,
        fileRefs: [],
        priority: featureRequest.kind === "bug" ? "high" : "medium",
      },
    ];
  } else {
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
    actionItems = items.map((a) => ({
      title: a.title,
      description: a.description,
      fileRefs: safeParseRefs(a.fileRefs),
      priority: a.priority,
    }));
  }

  // If the codebase is indexed, retrieve the most relevant code and synthesize a
  // short, code-grounded spec to drive the agent. Falls back to action items.
  let spec: string | undefined;
  if (meeting.codebaseChunks > 0 && isEmbeddingConfigured()) {
    try {
      const query = actionItems.map((a) => `${a.title}. ${a.description}`).join("\n");
      const relevantCode = await retrieveRelevantCode(id, query, 8);
      spec = await synthesizeSpec(id, { title: meeting.title, actionItems, relevantCode });
      log.info("code-change: synthesized spec from indexed codebase", {
        meetingId: id,
        retrieved: relevantCode.length,
      });
    } catch (err) {
      log.warn("code-change: spec synthesis failed, using raw action items", { meetingId: id, err });
    }
  }

  log.info("code-change: starting coding agent", {
    meetingId: id,
    repo: meeting.githubRepoUrl,
    items: actionItems.length,
    grounded: Boolean(spec),
  });

  let started: { sessionId: string; vaultId?: string };
  try {
    started = await startCodingSession({
      meetingTitle: meeting.title,
      repoUrl: meeting.githubRepoUrl,
      branch,
      installationId: meeting.githubInstallationId,
      actionItems,
      spec,
    });
  } catch (err) {
    log.error("code-change: failed to start coding agent", { meetingId: id, err });
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

  // Reflect that this feedback item is now being worked on.
  if (featureRequest) {
    await db
      .update(schema.featureRequests)
      .set({ status: "planned" })
      .where(eq(schema.featureRequests.id, featureRequest.id));
  }

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
