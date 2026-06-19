"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeChangePanel } from "./CodeChangePanel";

type ActionItem = {
  id: string;
  title: string;
  description: string;
  fileRefs: string; // JSON-encoded string[]
  priority: string;
};

const priorityColor: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-amber-500/15 text-amber-500",
  low: "bg-secondary/20 text-secondary",
};

export function ActionItemsPanel({
  meetingId,
  initialItems,
}: {
  meetingId: string;
  initialItems: ActionItem[];
}) {
  const [items, setItems] = useState<ActionItem[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setItems((prev) => [...data.actionItems, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Action items
        </h2>
        <Button size="sm" onClick={generate} disabled={busy} className="gap-1.5">
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {busy ? "Generating…" : "Generate"}
        </Button>
      </div>
      {error && <p className="px-4 py-2 text-xs text-destructive">{error}</p>}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Generate technical action items from the transcript and context.
          </p>
        )}
        {items.map((item) => {
          let refs: string[] = [];
          try {
            refs = JSON.parse(item.fileRefs);
          } catch {
            /* ignore */
          }
          return (
            <div key={item.id} className="rounded-lg border bg-card p-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    priorityColor[item.priority] ?? priorityColor.medium
                  }`}
                >
                  {item.priority}
                </span>
                <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
              {refs.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {refs.map((r) => (
                    <li key={r} className="font-mono text-[11px] text-primary">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <CodeChangePanel meetingId={meetingId} hasItems={items.length > 0} />
    </div>
  );
}
