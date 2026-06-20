"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ContextItem = { id: string; type: string; content: string };
type Repo = { fullName: string; htmlUrl: string };

export function ContextSidebar({
  meetingId,
  initialContext,
  initialRepoUrl,
  githubInstallationId,
  codebaseChunks,
}: {
  meetingId: string;
  initialContext: ContextItem[];
  initialRepoUrl: string | null;
  githubInstallationId: string | null;
  codebaseChunks: number;
}) {
  const [items, setItems] = useState<ContextItem[]>(initialContext);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl ?? "");
  const [manualRepo, setManualRepo] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(Boolean(githubInstallationId));
  const [chunks, setChunks] = useState(codebaseChunks);

  const loadRepos = useCallback(() => {
    fetch(`/api/meetings/${meetingId}/github/repos`)
      .then((r) => r.json())
      .then((d) => setRepos(d.repos ?? []))
      .catch(() => {});
  }, [meetingId]);

  // Load the installation's repos whenever the App is connected.
  useEffect(() => {
    if (connected) loadRepos();
  }, [connected, loadRepos]);

  // The "Connect GitHub App" popup signals success via postMessage.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === "github-app-connected") {
        setConnected(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function openConnect() {
    const w = 1024;
    const h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(
      `/api/github/app/connect?meetingId=${meetingId}`,
      "github-connect",
      `popup,width=${w},height=${h},left=${left},top=${top}`
    );
  }

  // Set which repo this meeting works with.
  async function setRepo(url: string) {
    setBusy("repo");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepoUrl: url }),
      });
      if (!res.ok) throw new Error("Could not set the repository");
      setRepoUrl(url);
      setChunks(0); // a new repo needs re-indexing
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the repository");
    } finally {
      setBusy(null);
    }
  }

  async function indexCodebase() {
    setBusy("index");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/index-codebase`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Indexing failed");
      setChunks(data.chunks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setBusy(null);
    }
  }

  async function addItem(type: "note" | "link", content: string, clear: () => void) {
    if (!content.trim()) return;
    setBusy(type);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setItems((prev) => [...prev, data.item]);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(null);
    }
  }

  const selectedRepo =
    repos.find((r) => repoUrl && (repoUrl === r.fullName || repoUrl === r.htmlUrl))
      ?.fullName ?? "";

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {/* --- Repository (primary) --- */}
      <div className="mb-5 rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Repository
          </h2>
          <a
            href="/help/github"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline"
          >
            How it works ↗
          </a>
        </div>

        {connected ? (
          <>
            <Badge variant="secondary" className="mb-2 gap-1">
              <CheckCircle2 className="size-3" /> GitHub App connected
            </Badge>
            <label className="mb-1 block text-xs text-muted-foreground">
              Repository for this meeting
            </label>
            {repos.length > 0 ? (
              <select
                value={selectedRepo}
                onChange={(e) => setRepo(e.target.value)}
                disabled={busy === "repo"}
                className="mb-1 h-9 w-full rounded-md border border-input bg-input/30 px-2 text-sm"
              >
                <option value="">Select a repository…</option>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">Loading repositories…</p>
            )}
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Install the GitHub App so coding agents can read the repo and open pull
              requests.
            </p>
            <Button size="sm" onClick={openConnect} className="gap-2">
              <GitBranch className="size-3.5" /> Connect GitHub App
            </Button>
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                Or use a public repo without the App
              </summary>
              <div className="mt-2 flex gap-2">
                <Input
                  value={manualRepo}
                  onChange={(e) => setManualRepo(e.target.value)}
                  placeholder="owner/repo"
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRepo(manualRepo)}
                  disabled={!manualRepo.trim() || busy === "repo"}
                >
                  Use
                </Button>
              </div>
            </details>
          </>
        )}

        {repoUrl && (
          <div className="mt-3 border-t border-border pt-3">
            <label className="mb-1 block text-xs text-muted-foreground">
              Codebase index (precise agent specs)
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={indexCodebase}
                disabled={busy === "index"}
                className="gap-1.5"
              >
                {busy === "index" && <Loader2 className="size-3.5 animate-spin" />}
                {busy === "index"
                  ? "Indexing…"
                  : chunks > 0
                    ? "Re-index"
                    : "Index codebase"}
              </Button>
              {chunks > 0 && (
                <span className="text-[11px] text-muted-foreground">{chunks} chunks</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Notes & links --- */}
      <label className="mb-1 block text-xs text-muted-foreground">Note</label>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="mb-2"
        placeholder="Drop a note for this meeting…"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addItem("note", note, () => setNote(""))}
        disabled={busy === "note"}
        className="mb-4 self-start"
      >
        Add note
      </Button>

      <label className="mb-1 block text-xs text-muted-foreground">Reference link</label>
      <Input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="mb-2"
        placeholder="https://…"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => addItem("link", link, () => setLink(""))}
        disabled={busy === "link"}
        className="mb-5 self-start"
      >
        Add link
      </Button>

      {/* --- Collected context --- */}
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Meeting context ({items.length})
      </h3>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Notes, links, and screen snapshots the AI uses to generate action items.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border bg-card p-2 text-xs">
            <Badge variant="outline" className="mr-2 uppercase">
              {item.type}
            </Badge>
            <span className="text-card-foreground">
              {item.content.length > 140 ? `${item.content.slice(0, 140)}…` : item.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
