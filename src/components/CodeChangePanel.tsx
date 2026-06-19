"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  running: "bg-sky-500/20 text-sky-300",
  needs_review: "bg-amber-500/20 text-amber-300",
  merged: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-red-500/20 text-red-300",
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

  // Load existing requests on mount.
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
    <div className="border-t border-neutral-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Merge requests
        </h3>
        <button
          onClick={createRequest}
          disabled={busy || !hasItems}
          title={hasItems ? "" : "Generate action items first"}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Create from action items"}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Kick off a coding agent to implement the action items and open a PR.
        </p>
      ) : (
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {requests.map((r) => (
            <li key={r.id} className="rounded border border-neutral-800 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColor[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
                {r.status === "needs_review" && (
                  <button
                    onClick={() => merge(r.id)}
                    disabled={merging === r.id}
                    className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {merging === r.id ? "Merging…" : "Merge"}
                  </button>
                )}
              </div>
              {r.branch && (
                <p className="mt-1 font-mono text-[10px] text-neutral-500">{r.branch}</p>
              )}
              {r.prUrl && (
                <a
                  href={r.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-sky-400 hover:underline"
                >
                  {r.prUrl}
                </a>
              )}
              {r.error && <p className="mt-1 text-red-400">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
