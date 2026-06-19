import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchRepoContext, renderRepoContext } from "@/lib/github";

// Inspect a GitHub repo, store a summarized `github` context item on the
// meeting, and record the repo URL on the meeting itself.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const meetingId = (body.meetingId ?? "").toString();
  const repoUrl = (body.repoUrl ?? "").toString().trim();
  const token = body.token?.toString().trim() || undefined;

  if (!meetingId || !repoUrl) {
    return NextResponse.json(
      { error: "meetingId and repoUrl are required" },
      { status: 400 }
    );
  }

  let summary: string;
  try {
    const ctx = await fetchRepoContext(repoUrl, token);
    summary = renderRepoContext(ctx);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to inspect repo" },
      { status: 502 }
    );
  }

  const item = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.contextItems)
      .values({ meetingId, type: "github", content: summary })
      .returning();
    await tx
      .update(schema.meetings)
      .set({ githubRepoUrl: repoUrl })
      .where(eq(schema.meetings.id, meetingId));
    return created;
  });

  return NextResponse.json({ item, summary }, { status: 201 });
}
