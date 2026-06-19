import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { isGithubAppConfigured, mintInstallationToken } from "@/lib/githubApp";

// Merge the pull request a coding agent opened. Done server-side via the GitHub
// API (not the agent), so a human stays in control of the merge.
export async function POST(
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
  if (request.status !== "needs_review" || !request.prNumber) {
    return NextResponse.json(
      { error: "No open pull request to merge for this request" },
      { status: 400 }
    );
  }

  const parsed = parseRepoUrl(request.repoUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse repo URL" }, { status: 400 });
  }

  // Prefer a per-meeting App installation token; fall back to the global PAT.
  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id))
    .limit(1);

  let token: string | undefined;
  try {
    if (meeting?.githubInstallationId && isGithubAppConfigured()) {
      token = await mintInstallationToken(meeting.githubInstallationId, parsed.repo);
    } else {
      token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not obtain GitHub token" },
      { status: 502 }
    );
  }
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub token available to merge" },
      { status: 503 }
    );
  }

  const octokit = new Octokit({ auth: token });
  try {
    await octokit.pulls.merge({
      owner: parsed.owner,
      repo: parsed.repo,
      pull_number: request.prNumber,
      merge_method: "squash",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Merge failed" },
      { status: 502 }
    );
  }

  const [updated] = await db
    .update(schema.codeChangeRequests)
    .set({ status: "merged" })
    .where(eq(schema.codeChangeRequests.id, reqId))
    .returning();

  return NextResponse.json({ request: updated });
}
