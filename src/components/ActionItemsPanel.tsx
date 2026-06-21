"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

type Draft = { title: string; description: string; priority: string };

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: "", description: "", priority: "medium" });
  const [pending, setPending] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setItems((prev) => [...data.actionItems, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: ActionItem) {
    setEditingId(item.id);
    setDraft({ title: item.title, description: item.description, priority: item.priority });
  }

  async function saveEdit(itemId: string) {
    setPending(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setItems((prev) => prev.map((i) => (i.id === itemId ? data.item : i)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(null);
    }
  }

  async function remove(itemId: string) {
    setPending(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Action items
        </h2>
        <Button size="sm" onClick={generate} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
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
          if (editingId === item.id) {
            return (
              <div key={item.id} className="space-y-2 rounded-lg border bg-card p-3">
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Title"
                  className="h-8 text-sm"
                />
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={3}
                  placeholder="Description"
                  className="text-xs"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={draft.priority}
                    onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                    className="h-8 rounded-md border border-input bg-input/30 px-2 text-xs"
                  >
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                  <Button
                    size="sm"
                    onClick={() => saveEdit(item.id)}
                    disabled={pending === item.id}
                    className="h-8 gap-1"
                  >
                    {pending === item.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    className="h-8 gap-1"
                  >
                    <X className="size-3.5" /> Cancel
                  </Button>
                </div>
              </div>
            );
          }

          let refs: string[] = [];
          try {
            refs = JSON.parse(item.fileRefs);
          } catch {
            /* ignore */
          }
          return (
            <div key={item.id} className="group rounded-lg border bg-card p-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    priorityColor[item.priority] ?? priorityColor.medium
                  }`}
                >
                  {item.priority}
                </span>
                <h3 className="flex-1 text-sm font-medium text-foreground">{item.title}</h3>
                <button
                  onClick={() => startEdit(item)}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  title="Edit"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => remove(item.id)}
                  disabled={pending === item.id}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Delete"
                >
                  {pending === item.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
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
    </div>
  );
}
