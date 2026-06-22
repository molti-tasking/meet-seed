import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { desc, eq, isNotNull } from "drizzle-orm";
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
  if (!isGithubAppConfigured()) {
    return NextResponse.json({ repos: [], installationId: null });
  }

  // A GitHub App installation is account/org-wide and reusable across meetings.
  // If this meeting isn't bound to one yet, fall back to the most recently
  // connected installation so a fresh meeting for the same repo can still pick
  // it without re-installing. Binding to THIS meeting happens on repo-select.
  let installationId = meeting.githubInstallationId;
  if (!installationId) {
    const [recent] = await db
      .select({ id: schema.meetings.githubInstallationId })
      .from(schema.meetings)
      .where(isNotNull(schema.meetings.githubInstallationId))
      .orderBy(desc(schema.meetings.createdAt))
      .limit(1);
    installationId = recent?.id ?? null;
  }
  if (!installationId) {
    return NextResponse.json({ repos: [], installationId: null });
  }

  try {
    // Unscoped installation token → can list all accessible repos.
    const token = await mintInstallationToken(installationId);
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });
    const repos = data.repositories.map((r) => ({
      fullName: r.full_name,
      htmlUrl: r.html_url,
    }));
    return NextResponse.json({ repos, installationId });
  } catch (err) {
    log.error("github/repos: failed to list installation repos", {
      meetingId: id,
      installationId,
      err,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list repos" },
      { status: 502 }
    );
  }
}
