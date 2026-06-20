import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { isGithubAppConfigured, mintInstallationToken } from "@/lib/githubApp";
import { isEmbeddingConfigured } from "@/lib/embeddings";
import { ingestRepo } from "@/lib/codebase";
import { log } from "@/lib/logger";

// Download the connected repo, embed it (Voyage), and store chunks for retrieval.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isEmbeddingConfigured()) {
    return NextResponse.json(
      { error: "VOYAGE_API_KEY is not configured" },
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
      { error: "Connect a GitHub repository first" },
      { status: 400 }
    );
  }
  const parsed = parseRepoUrl(meeting.githubRepoUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse the repo URL" }, { status: 400 });
  }

  // Prefer a per-meeting App installation token; fall back to the global PAT.
  let token: string | undefined;
  try {
    if (meeting.githubInstallationId && isGithubAppConfigured()) {
      token = await mintInstallationToken(meeting.githubInstallationId, parsed.repo);
    } else {
      token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || undefined;
    }
  } catch {
    token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || undefined;
  }

  try {
    log.info("index-codebase: starting", { meetingId: id, repo: `${parsed.owner}/${parsed.repo}` });
    const result = await ingestRepo(id, parsed.owner, parsed.repo, token);
    log.info("index-codebase: done", { meetingId: id, ...result });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    log.error("index-codebase: failed", { meetingId: id, repo: `${parsed.owner}/${parsed.repo}`, err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Indexing failed" },
      { status: 502 }
    );
  }
}
