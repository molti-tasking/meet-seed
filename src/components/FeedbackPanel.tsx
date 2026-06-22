"use client";

import { useCallback, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { Bot, Check, Loader2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type FeatureRequest = {
  id: string;
  kind: string; // question | bug | feature
  title: string;
  detail: string;
  status: string; // open | planned | done | dismissed
};

const TOPIC = "feedback";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Wire =
  | { type: "upsert"; request: FeatureRequest }
  | { type: "delete"; id: string };

const kindMeta: Record<string, { label: string; cls: string }> = {
  question: { label: "Question", cls: "bg-primary/15 text-primary" },
  bug: { label: "Bug", cls: "bg-destructive/15 text-destructive" },
  feature: { label: "Feature", cls: "bg-secondary/20 text-secondary" },
};

const statusMeta: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "text-muted-foreground" },
  planned: { label: "Planned", cls: "text-amber-500" },
  done: { label: "Done", cls: "text-secondary" },
  dismissed: { label: "Dismissed", cls: "text-muted-foreground line-through" },
};

export function FeedbackPanel({
  meetingId,
  initialRequests,
  canBuild,
}: {
  meetingId: string;
  initialRequests: FeatureRequest[];
  canBuild: boolean;
}) {
  const [requests, setRequests] = useState<FeatureRequest[]>(initialRequests);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upsert = useCallback((r: FeatureRequest) => {
    setRequests((prev) => {
      const i = prev.findIndex((x) => x.id === r.id);
      if (i === -1) return [r, ...prev];
      const next = [...prev];
      next[i] = r;
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setRequests((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Live sync across participants.
  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const m = JSON.parse(decoder.decode(msg.payload)) as Wire;
      if (m.type === "upsert") upsert(m.request);
      else removeLocal(m.id);
    } catch {
      /* ignore */
    }
  });

  const broadcast = useCallback(
    (m: Wire) => {
      try {
        const r = send(encoder.encode(JSON.stringify(m)), {
          topic: TOPIC,
          reliable: true,
        });
        if (r && typeof (r as Promise<unknown>).then === "function") {
          (r as Promise<unknown>).catch(() => {});
        }
      } catch {
        /* data channel not ready */
      }
    },
    [send]
  );

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/feature-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not submit");
      upsert(d.request);
      broadcast({ type: "upsert", request: d.request });
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(r: FeatureRequest, status: string) {
    setBusy(r.id);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/feature-requests/${r.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const d = await res.json();
      if (res.ok && d.request) {
        upsert(d.request);
        broadcast({ type: "upsert", request: d.request });
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(
        `/api/meetings/${meetingId}/feature-requests/${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        removeLocal(id);
        broadcast({ type: "delete", id });
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendToAgent(r: FeatureRequest) {
    setBusy(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/code-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureRequestId: r.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not start agent");
      const planned = { ...r, status: "planned" };
      upsert(planned);
      broadcast({ type: "upsert", request: planned });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start agent");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Product feedback
      </h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Ask the system a question or request a feature/bug fix for this tool
        itself. Items become a shared backlog you can fix early.
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="mb-2"
        placeholder="e.g. The repo picker disappears for a second meeting…"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="mb-4 flex items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting || !text.trim()}
          className="gap-1.5 self-start"
        >
          {submitting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Submit
        </Button>
        <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter</span>
      </div>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Requests ({requests.length})
      </h3>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet — submit the first one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => {
            const kind = kindMeta[r.kind] ?? kindMeta.feature;
            const status = statusMeta[r.status] ?? statusMeta.open;
            const terminal = r.status === "done" || r.status === "dismissed";
            return (
              <li key={r.id} className="rounded-lg border bg-card p-2.5 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kind.cls}`}
                  >
                    {kind.label}
                  </span>
                  <span className={`text-[10px] font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
                <p className="font-medium text-card-foreground">{r.title}</p>
                {r.detail && (
                  <p className="mt-0.5 text-muted-foreground">{r.detail}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {canBuild && !terminal && r.status !== "planned" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => sendToAgent(r)}
                      disabled={busy === r.id}
                      className="h-6 gap-1 px-2 text-[11px]"
                    >
                      {busy === r.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Bot className="size-3" />
                      )}
                      Send to agent
                    </Button>
                  )}
                  {!terminal && (
                    <button
                      onClick={() => patch(r, "done")}
                      disabled={busy === r.id}
                      title="Mark done"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Check className="size-3" /> Done
                    </button>
                  )}
                  {!terminal && (
                    <button
                      onClick={() => patch(r, "dismissed")}
                      disabled={busy === r.id}
                      title="Dismiss"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" /> Dismiss
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.id)}
                    disabled={busy === r.id}
                    title="Delete"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
