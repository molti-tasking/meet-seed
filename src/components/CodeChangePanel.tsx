"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GitPullRequest, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type CodeChangeRequest = {
  id: string;
  status: "running" | "needs_review" | "merged" | "failed";
  branch: string | null;
  prUrl: string | null;
  prNumber: number | null;
  error: string | null;
};

const statusLabel: Record<CodeChangeRequest["status"], string> = {
  running: "Agent working…",
  needs_review: "PR ready for review",
  merged: "Merged",
  failed: "Failed",
};

const statusColor: Record<CodeChangeRequest["status"], string> = {
  running: "bg-primary/15 text-primary",
  needs_review: "bg-amber-500/15 text-amber-500",
  merged: "bg-secondary/20 text-secondary",
  failed: "bg-destructive/15 text-destructive",
};

export function CodeChangePanel({
  meetingId,
  hasItems,
}: {
  meetingId: string;
  hasItems: boolean;
}) {
  const [requests, setRequests] = useState<CodeChangeRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

  const upsert = useCallback((r: CodeChangeRequest) => {
    setRequests((prev) => {
      const i = prev.findIndex((x) => x.id === r.id);
      if (i === -1) return [r, ...prev];
      const next = [...prev];
      next[i] = r;
      return next;
    });
  }, []);

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}/code-change`)
      .then((r) => r.json())
      .then((d) => setRequests(d.requests ?? []))
      .catch(() => {});
  }, [meetingId]);

  // Poll any still-running requests every 5s. Mirror state into a ref (written
  // in an effect, not during render) so the interval reads the latest list.
  const requestsRef = useRef(requests);
  useEffect(() => {
    requestsRef.current = requests;
  });
  useEffect(() => {
    const interval = setInterval(() => {
      for (const r of requestsRef.current) {
        if (r.status !== "running") continue;
        fetch(`/api/meetings/${meetingId}/code-change/${r.id}`)
          .then((res) => res.json())
          .then((d) => d.request && upsert(d.request))
          .catch(() => {});
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [meetingId, upsert]);

  async function createRequest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/code-change`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      upsert(data.request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  async function merge(reqId: string) {
    setMerging(reqId);
    setError(null);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/code-change/${reqId}/merge`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Merge failed");
      upsert(data.request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(null);
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Merge requests
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={createRequest}
          disabled={busy || !hasItems}
          title={hasItems ? "" : "Generate action items first"}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GitPullRequest className="size-3.5" />
          )}
          {busy ? "Starting…" : "Create from action items"}
        </Button>
      </div>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Kick off a coding agent to implement the action items and open a PR.
        </p>
      ) : (
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor[r.status]}`}
                >
                  {statusLabel[r.status]}
                </span>
                {r.status === "needs_review" && (
                  <Button
                    size="sm"
                    onClick={() => merge(r.id)}
                    disabled={merging === r.id}
                    className="h-6 px-2 text-[10px]"
                  >
                    {merging === r.id ? "Merging…" : "Merge"}
                  </Button>
                )}
              </div>
              {r.branch && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.branch}</p>
              )}
              {r.prUrl && (
                <a
                  href={r.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-primary hover:underline"
                >
                  {r.prUrl}
                </a>
              )}
              {r.error && <p className="mt-1 text-destructive">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
