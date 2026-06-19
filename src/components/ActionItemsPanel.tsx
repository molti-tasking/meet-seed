"use client";

import { useState } from "react";

type ActionItem = {
  id: string;
  title: string;
  description: string;
  fileRefs: string; // JSON-encoded string[]
  priority: string;
};

const priorityColor: Record<string, string> = {
  high: "bg-red-500/20 text-red-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-emerald-500/20 text-emerald-300",
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
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Action items
        </h2>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
      {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 && (
          <p className="text-sm text-neutral-500">
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
            <div key={item.id} className="rounded border border-neutral-800 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    priorityColor[item.priority] ?? priorityColor.medium
                  }`}
                >
                  {item.priority}
                </span>
                <h3 className="text-sm font-medium text-neutral-100">{item.title}</h3>
              </div>
              <p className="text-xs text-neutral-300">{item.description}</p>
              {refs.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {refs.map((r) => (
                    <li key={r} className="font-mono text-[11px] text-sky-400">
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
