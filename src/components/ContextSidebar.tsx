"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ContextItem = { id: string; type: string; content: string };

export function ContextSidebar({
  meetingId,
  initialContext,
  initialRepoUrl,
  githubInstallationId,
}: {
  meetingId: string;
  initialContext: ContextItem[];
  initialRepoUrl: string | null;
  githubInstallationId: string | null;
}) {
  const [items, setItems] = useState<ContextItem[]>(initialContext);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl ?? "");
  const [repoToken, setRepoToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(Boolean(githubInstallationId));

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

  async function inspectRepo() {
    if (!repoUrl.trim()) return;
    setBusy("github");
    setError(null);
    try {
      const res = await fetch("/api/github/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, repoUrl, token: repoToken || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to inspect repo");
      setItems((prev) => [...prev, data.item]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to inspect repo");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Context
      </h2>

      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}

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
        className="mb-4 self-start"
      >
        Add link
      </Button>

      <label className="mb-1 block text-xs text-muted-foreground">GitHub repository</label>
      <Input
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        className="mb-2"
        placeholder="owner/repo or https://github.com/owner/repo"
      />
      <Input
        value={repoToken}
        onChange={(e) => setRepoToken(e.target.value)}
        className="mb-2"
        placeholder="Optional token (for private repos)"
        type="password"
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={inspectRepo}
        disabled={busy === "github"}
        className="mb-4 self-start gap-2"
      >
        {busy === "github" && <Loader2 className="size-3.5 animate-spin" />}
        {busy === "github" ? "Inspecting…" : "Connect repo"}
      </Button>

      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          GitHub App (write access)
        </label>
        <a
          href="/help/github"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline"
        >
          How to connect ↗
        </a>
      </div>
      {connected ? (
        <Badge variant="secondary" className="mb-4 gap-1">
          <CheckCircle2 className="size-3" /> Connected
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={openConnect}
          className="mb-4 self-start gap-2"
        >
          <GitBranch className="size-3.5" /> Connect GitHub App
        </Button>
      )}

      <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Attached ({items.length})
      </h3>
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
