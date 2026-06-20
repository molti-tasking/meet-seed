import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isGithubAppConfigured, mintInstallationToken } from "@/lib/githubApp";
import { log } from "@/lib/logger";

// List the repositories the connected GitHub App installation can access, so the
// user can pick which one this meeting works with.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id))
    .limit(1);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (!meeting.githubInstallationId || !isGithubAppConfigured()) {
    return NextResponse.json({ repos: [] });
  }

  try {
    // Unscoped installation token → can list all accessible repos.
    const token = await mintInstallationToken(meeting.githubInstallationId);
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });
    const repos = data.repositories.map((r) => ({
      fullName: r.full_name,
      htmlUrl: r.html_url,
    }));
    return NextResponse.json({ repos });
  } catch (err) {
    log.error("github/repos: failed to list installation repos", {
      meetingId: id,
      installationId: meeting.githubInstallationId,
      err,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list repos" },
      { status: 502 }
    );
  }
}
