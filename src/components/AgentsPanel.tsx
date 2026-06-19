"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleDot,
  GitMerge,
  Loader2,
  MessageCircleQuestion,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Status = "running" | "needs_input" | "needs_review" | "merged" | "failed";
type ThreadEntry = { id: string; kind: string; text: string };
type Req = {
  id: string;
  status: Status;
  branch: string | null;
  prUrl: string | null;
  prNumber: number | null;
  question: string | null;
  error: string | null;
};

const statusMeta: Record<Status, { label: string; cls: string }> = {
  running: { label: "Working", cls: "bg-primary/15 text-primary" },
  needs_input: { label: "Needs your input", cls: "bg-amber-500/15 text-amber-500" },
  needs_review: { label: "PR ready", cls: "bg-amber-500/15 text-amber-500" },
  merged: { label: "Merged", cls: "bg-secondary/20 text-secondary" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
};

export function AgentsPanel({ meetingId }: { meetingId: string }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [threads, setThreads] = useState<Record<string, ThreadEntry[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const upsert = useCallback((r: Req) => {
    setReqs((prev) => {
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
      .then((d) => setReqs(d.requests ?? []))
      .catch(() => {});
  }, [meetingId]);

  // Poll the thread of every non-terminal run.
  const reqsRef = useRef(reqs);
  useEffect(() => {
    reqsRef.current = reqs;
  });
  useEffect(() => {
    const poll = () => {
      for (const r of reqsRef.current) {
        if (r.status === "merged" || r.status === "failed") continue;
        fetch(`/api/meetings/${meetingId}/code-change/${r.id}`)
          .then((res) => res.json())
          .then((d) => {
            if (d.request) upsert(d.request);
            if (d.entries) setThreads((t) => ({ ...t, [r.id]: d.entries }));
          })
          .catch(() => {});
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [meetingId, upsert]);

  async function send(reqId: string) {
    const message = (drafts[reqId] ?? "").trim();
    if (!message) return;
    setBusy(reqId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/code-change/${reqId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const d = await res.json();
      if (res.ok) {
        upsert(d.request);
        setDrafts((s) => ({ ...s, [reqId]: "" }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function merge(reqId: string) {
    setBusy(reqId);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/code-change/${reqId}/merge`,
        { method: "POST" }
      );
      const d = await res.json();
      if (res.ok) upsert(d.request);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Coding agents
      </h2>
      {reqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Start a coding agent from the Action items panel. Its progress,
          questions, and pull request show up here.
        </p>
      ) : (
        <div className="space-y-4">
          {reqs.map((r) => {
            const meta = statusMeta[r.status];
            const entries = threads[r.id] ?? [];
            const interactive = r.status === "running" || r.status === "needs_input";
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                  {r.branch && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {r.branch}
                    </span>
                  )}
                </div>

                {/* Live thread */}
                <ul className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {entries.map((e) => (
                    <li key={e.id} className="flex gap-1.5 text-xs">
                      {e.kind === "message" ? (
                        <span className="text-card-foreground">{e.text}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CircleDot className="size-3" /> {e.text}
                        </span>
                      )}
                    </li>
                  ))}
                  {entries.length === 0 && r.status === "running" && (
                    <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Starting…
                    </li>
                  )}
                </ul>

                {r.status === "needs_input" && r.question && (
                  <div className="mb-2 flex gap-1.5 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                    <MessageCircleQuestion className="mt-0.5 size-3.5 shrink-0" />
                    <span>{r.question}</span>
                  </div>
                )}

                {r.prUrl && (
                  <a
                    href={r.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 block break-all text-xs text-primary hover:underline"
                  >
                    {r.prUrl}
                  </a>
                )}
                {r.error && <p className="mb-2 text-xs text-destructive">{r.error}</p>}

                {/* Reply / steer */}
                {interactive && (
                  <div className="space-y-1.5">
                    <Textarea
                      value={drafts[r.id] ?? ""}
                      onChange={(e) => setDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                      rows={2}
                      placeholder={
                        r.status === "needs_input"
                          ? "Answer the agent…"
                          : "Send extra context / steer the agent…"
                      }
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={() => send(r.id)}
                      disabled={busy === r.id}
                      className="gap-1.5"
                    >
                      {busy === r.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      Send
                    </Button>
                  </div>
                )}

                {r.status === "needs_review" && (
                  <Button
                    size="sm"
                    onClick={() => merge(r.id)}
                    disabled={busy === r.id}
                    className="gap-1.5"
                  >
                    {busy === r.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <GitMerge className="size-3.5" />
                    )}
                    Merge
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
