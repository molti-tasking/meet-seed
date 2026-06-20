"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BarChart3, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Meeting = {
  id: string;
  title: string;
  roomName: string;
  createdAt: string;
};

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [connectMode, setConnectMode] = useState<"none" | "url" | "app">("none");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((d) => setMeetings(d.meetings ?? []))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          githubRepoUrl: connectMode === "url" && repoUrl ? repoUrl : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      // Mark this browser as the meeting owner (controls views & permissions).
      try {
        localStorage.setItem(`owner:${data.meeting.id}`, "1");
      } catch {
        /* no localStorage */
      }
      // For the App option, open the GitHub install bound to the new meeting in
      // a popup, then drop the user into the room (which picks up the install).
      if (connectMode === "app") {
        window.open(
          `/api/github/app/connect?meetingId=${data.meeting.id}`,
          "github-connect",
          "popup,width=1024,height=720"
        );
      }
      router.push(`/meeting/${data.meeting.roomName}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Soft brand backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(40rem 40rem at 85% -10%, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent), radial-gradient(35rem 35rem at 10% 10%, color-mix(in srgb, var(--color-secondary) 14%, transparent), transparent)",
        }}
      />

      <main className="mx-auto max-w-2xl px-6 py-20">
        <p className="font-heading text-xs font-semibold uppercase tracking-widest text-primary">
          seedlabs · meeting intelligence
        </p>
        <h1 className="font-heading mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Tech meetings that{" "}
          <span className="gradient-text">resolve themselves</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Run a software specification meeting with live transcription,
          shared-surface recording, attached context, and AI-generated technical
          action items — that turn straight into your connected repositories
          pull requests.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium">
          <Link
            href="/help/github"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <GitBranch className="size-4" /> How to connect a GitHub repository
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <BarChart3 className="size-4" /> AI usage dashboard
          </Link>
        </div>

        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="font-heading text-lg">New meeting</CardTitle>
            <CardDescription>
              Spin up a room and invite participants by sharing the link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-3">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting title"
                required
              />
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Connect a repository (optional)
                </p>
                <div className="inline-flex rounded-md border p-0.5">
                  {(
                    [
                      ["none", "Skip"],
                      ["url", "Paste URL"],
                      ["app", "GitHub App"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConnectMode(mode)}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        connectMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {connectMode === "url" && (
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="owner/repo or https://github.com/owner/repo"
                />
              )}
              {connectMode === "app" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitBranch className="size-3.5" />
                  We&apos;ll open GitHub to install the app for write access right after
                  creating the meeting.
                </p>
              )}

              <Button type="submit" disabled={busy} className="gap-2">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "Creating…" : connectMode === "app" ? "Create & connect" : "Create & join"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {meetings.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent meetings
            </h2>
            <div className="space-y-2">
              {meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meeting/${m.roomName}`}
                  className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.roomName}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
