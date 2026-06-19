import { NextResponse } from "next/server";
import { getInstallUrl, isGithubAppConfigured } from "@/lib/githubApp";

// Redirect the user to GitHub to install the App for this meeting's repo.
export async function GET(req: Request) {
  const meetingId = new URL(req.url).searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }
  if (!isGithubAppConfigured()) {
    return NextResponse.json(
      { error: "GitHub App is not configured" },
      { status: 503 }
    );
  }
  return NextResponse.redirect(getInstallUrl(meetingId));
}
