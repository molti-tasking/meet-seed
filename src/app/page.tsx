"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Meeting = { id: string; title: string; roomName: string; createdAt: string };

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((d) => setMeetings(d.meetings ?? []))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, githubRepoUrl: repoUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/meeting/${data.meeting.roomName}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-100">
      <h1 className="text-2xl font-bold">Meeting Intelligence</h1>
      <p className="mt-2 text-neutral-400">
        Run a consulting meeting that captures itself — live transcription, shared-surface
        recording, attached context, and AI-generated technical action items.
      </p>

      <form onSubmit={create} className="mt-8 rounded-lg border border-neutral-800 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          New meeting
        </h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title"
          className="mb-3 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
          required
        />
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="GitHub repo (optional) — owner/repo"
          className="mb-3 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create & join"}
        </button>
      </form>

      {meetings.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Recent meetings
          </h2>
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id}>
                <a
                  href={`/meeting/${m.roomName}`}
                  className="block rounded border border-neutral-800 px-4 py-2 text-sm hover:bg-neutral-900"
                >
                  {m.title}
                  <span className="ml-2 text-xs text-neutral-500">{m.roomName}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
