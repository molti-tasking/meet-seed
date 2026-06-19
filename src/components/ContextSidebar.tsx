"use client";

import { useState } from "react";

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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Context
      </h2>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      <label className="mb-1 block text-xs text-neutral-400">Note</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="mb-1 w-full rounded bg-neutral-800 p-2 text-sm text-neutral-100"
        placeholder="Drop a note for this meeting…"
      />
      <button
        onClick={() => addItem("note", note, () => setNote(""))}
        disabled={busy === "note"}
        className="mb-4 self-start rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
      >
        Add note
      </button>

      <label className="mb-1 block text-xs text-neutral-400">Reference link</label>
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="mb-1 w-full rounded bg-neutral-800 p-2 text-sm text-neutral-100"
        placeholder="https://…"
      />
      <button
        onClick={() => addItem("link", link, () => setLink(""))}
        disabled={busy === "link"}
        className="mb-4 self-start rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
      >
        Add link
      </button>

      <label className="mb-1 block text-xs text-neutral-400">GitHub repository</label>
      <input
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        className="mb-1 w-full rounded bg-neutral-800 p-2 text-sm text-neutral-100"
        placeholder="owner/repo or https://github.com/owner/repo"
      />
      <input
        value={repoToken}
        onChange={(e) => setRepoToken(e.target.value)}
        className="mb-1 w-full rounded bg-neutral-800 p-2 text-sm text-neutral-100"
        placeholder="Optional GitHub token (for private repos)"
        type="password"
      />
      <button
        onClick={inspectRepo}
        disabled={busy === "github"}
        className="mb-4 self-start rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
      >
        {busy === "github" ? "Inspecting…" : "Connect repo"}
      </button>

      <label className="mb-1 block text-xs text-neutral-400">
        GitHub App (write access for merge requests)
      </label>
      {githubInstallationId ? (
        <span className="mb-4 self-start rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">
          ✓ Connected
        </span>
      ) : (
        <a
          href={`/api/github/app/connect?meetingId=${meetingId}`}
          className="mb-4 self-start rounded bg-neutral-700 px-3 py-1 text-xs hover:bg-neutral-600"
        >
          Connect GitHub App
        </a>
      )}

      <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Attached ({items.length})
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded bg-neutral-800 p-2 text-xs">
            <span className="mr-2 rounded bg-neutral-700 px-1.5 py-0.5 uppercase text-neutral-300">
              {item.type}
            </span>
            <span className="text-neutral-300">
              {item.content.length > 140 ? `${item.content.slice(0, 140)}…` : item.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
