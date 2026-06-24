"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, GitBranch, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useResourceSync } from "@/hooks/useMeetingSync";

type ContextItem = { id: string; type: string; content: string };
type Repo = { fullName: string; htmlUrl: string };

export function ContextSidebar({
  meetingId,
  initialContext,
  initialRepoUrl,
  githubInstallationId,
  codebaseChunks,
  initialGlossary,
}: {
  meetingId: string;
  initialContext: ContextItem[];
  initialRepoUrl: string | null;
  githubInstallationId: string | null;
  codebaseChunks: number;
  initialGlossary: string[];
}) {
  const [items, setItems] = useState<ContextItem[]>(initialContext);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl ?? "");
  const [manualRepo, setManualRepo] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The installation in effect for this meeting: its own, or an inherited one
  // (account-wide installs are reusable). Discovered from the repos endpoint.
  const [installationId, setInstallationId] = useState<string | null>(
    githubInstallationId
  );
  // True when the installation in effect was borrowed from another meeting
  // (the fallback in the repos route), not connected for THIS meeting.
  const [inherited, setInherited] = useState(false);
  const [chunks, setChunks] = useState(codebaseChunks);
  const [glossary, setGlossary] = useState<string[]>(initialGlossary);
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const loadRepos = useCallback(() => {
    fetch(`/api/meetings/${meetingId}/github/repos`)
      .then((r) => r.json())
      .then((d) => {
        setReposError(d.error ?? null);
        setRepos(d.repos ?? []);
        setInstallationId(d.installationId ?? null);
        setInherited(Boolean(d.inherited));
      })
      .catch(() => setReposError("Could not reach the server"))
      .finally(() => setReposLoaded(true));
  }, [meetingId]);

  // Re-read this meeting's context + repo binding from the DB. Runs on mount
  // (so returning to this tab restores state instead of stale SSR props — the
  // panel unmounts on tab switch), on a sync signal, and on the safety poll.
  const refetchContext = useCallback(() => {
    fetch(`/api/meetings/${meetingId}`)
      .then((r) => r.json())
      .then((d) => {
        const m = d.meeting;
        if (!m) return;
        if (Array.isArray(m.context)) {
          setItems(
            m.context.map((c: ContextItem) => ({
              id: c.id,
              type: c.type,
              content: c.content,
            }))
          );
        }
        setRepoUrl(m.githubRepoUrl ?? "");
        if (typeof m.codebaseChunks === "number") setChunks(m.codebaseChunks);
        // Only adopt a non-null installation so we don't clobber one that
        // loadRepos discovered as inherited from an earlier meeting.
        if (m.githubInstallationId) setInstallationId(m.githubInstallationId);
      })
      .catch(() => {});
  }, [meetingId]);
  const notifyChange = useResourceSync("context", refetchContext);

  // Glossary: re-read the meeting's domain terms on a sync signal so edits by
  // other participants (and the live keyterms in TranscriptPanel) stay current.
  const refetchGlossary = useCallback(() => {
    fetch(`/api/meetings/${meetingId}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.meeting?.glossary !== "string") return;
        try {
          setGlossary(JSON.parse(d.meeting.glossary) as string[]);
        } catch {
          /* malformed — leave as-is */
        }
      })
      .catch(() => {});
  }, [meetingId]);
  const notifyGlossary = useResourceSync("glossary", refetchGlossary);

  // Persist the full term list and let others (incl. live keyterms) pick it up.
  const saveGlossary = useCallback(
    (next: string[]) => {
      setGlossary(next);
      fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ glossary: next }),
      })
        .then(() => notifyGlossary())
        .catch(() => {});
    },
    [meetingId, notifyGlossary]
  );

  // Always probe for an installation on mount: this meeting may inherit an
  // account-wide install connected in an earlier meeting.
  useEffect(() => {
    loadRepos();
    refetchContext();
  }, [loadRepos, refetchContext]);

  // Suggested glossary terms, derived from the indexed repo + context.
  useEffect(() => {
    fetch(`/api/meetings/${meetingId}/glossary/suggest`)
      .then((r) => r.json())
      .then((d) => setSuggestions(Array.isArray(d.terms) ? d.terms : []))
      .catch(() => {});
  }, [meetingId, chunks, items.length]);

  // The "Connect GitHub App" popup signals success via postMessage; reload to
  // pick up the freshly bound installation and its repos.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && e.data?.type === "github-app-connected") {
        setReposLoaded(false);
        loadRepos();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadRepos]);

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

  // Set which repo this meeting works with.
  async function setRepo(url: string) {
    setBusy("repo");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubRepoUrl: url,
          // Bind the (possibly inherited) installation so this meeting's agents
          // and indexing can authenticate against the chosen repo.
          ...(installationId ? { githubInstallationId: installationId } : {}),
        }),
      });
      if (!res.ok) throw new Error("Could not set the repository");
      setRepoUrl(url);
      setChunks(0); // a new repo needs re-indexing
      notifyChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the repository");
    } finally {
      setBusy(null);
    }
  }

  // Clear this meeting's GitHub binding (installation + repo). Useful to undo a
  // wrong connection; afterward an account-wide install may still be offered.
  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubInstallationId: "", githubRepoUrl: "" }),
      });
      if (!res.ok) throw new Error("Could not disconnect");
      setRepoUrl("");
      setRepos([]);
      setInstallationId(null);
      setInherited(false);
      setChunks(0);
      notifyChange();
      loadRepos(); // re-probe (an account-wide install may resurface as inherited)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  }

  async function indexCodebase() {
    setBusy("index");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/index-codebase`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Indexing failed");
      setChunks(data.chunks);
      notifyChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Indexing failed");
    } finally {
      setBusy(null);
    }
  }

  function addTerm(t: string) {
    const v = t.trim();
    if (!v || glossary.includes(v)) return;
    saveGlossary([...glossary, v]);
    setTerm("");
  }

  function removeTerm(t: string) {
    saveGlossary(glossary.filter((x) => x !== t));
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
      notifyChange();
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(null);
    }
  }

  const selectedRepo =
    repos.find((r) => repoUrl && (repoUrl === r.fullName || repoUrl === r.htmlUrl))
      ?.fullName ?? "";

  // A clickable URL for the connected repo: an explicit http(s) URL as-is,
  // otherwise the matched repo's GitHub page or an owner/repo slug expanded.
  const repoHref = repoUrl
    ? repoUrl.startsWith("http")
      ? repoUrl
      : repos.find((r) => r.fullName === repoUrl)?.htmlUrl ??
        `https://github.com/${repoUrl}`
    : null;
  const repoLabel = selectedRepo || repoUrl.replace(/^https?:\/\/github\.com\//, "");
  const freshSuggestions = suggestions.filter((s) => !glossary.includes(s));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

      {/* --- Repository (primary) --- */}
      <div className="mb-5 rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Repository
          </h2>
          <a
            href="/help/github"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline"
          >
            How it works ↗
          </a>
        </div>

        {!reposLoaded ? (
          <p className="text-xs text-muted-foreground">Checking GitHub…</p>
        ) : installationId ? (
          <>
            {inherited ? (
              <Badge variant="outline" className="mb-2 gap-1">
                <GitBranch className="size-3" /> Using a GitHub App from another meeting
              </Badge>
            ) : (
              <Badge variant="secondary" className="mb-2 gap-1">
                <CheckCircle2 className="size-3" /> GitHub App connected
              </Badge>
            )}
            {inherited && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                This connection was carried over from an earlier meeting. To use a
                repository from a different account, connect your own GitHub App below.
              </p>
            )}
            <label className="mb-1 block text-xs text-muted-foreground">
              Repository for this meeting
            </label>
            {repos.length > 0 ? (
              <select
                value={selectedRepo}
                onChange={(e) => setRepo(e.target.value)}
                disabled={busy === "repo"}
                className="mb-1 h-9 w-full rounded-md border border-input bg-input/30 px-2 text-sm"
              >
                <option value="">Select a repository…</option>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-muted-foreground">
                <p className="mb-1 text-destructive">
                  {reposError ?? "No repositories found for this installation."}
                </p>
                <button
                  onClick={() => {
                    setReposLoaded(false);
                    setReposError(null);
                    loadRepos();
                  }}
                  className="text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={openConnect}
                className="gap-1.5"
              >
                <GitBranch className="size-3.5" /> Connect a different GitHub App
              </Button>
              {!inherited && (
                <button
                  onClick={disconnect}
                  disabled={busy === "disconnect"}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Disconnect
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Install the GitHub App so coding agents can read the repo and open pull
              requests.
            </p>
            <Button size="sm" onClick={openConnect} className="gap-2">
              <GitBranch className="size-3.5" /> Connect GitHub App
            </Button>
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                Or use a public repo without the App
              </summary>
              <div className="mt-2 flex gap-2">
                <Input
                  value={manualRepo}
                  onChange={(e) => setManualRepo(e.target.value)}
                  placeholder="owner/repo"
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRepo(manualRepo)}
                  disabled={!manualRepo.trim() || busy === "repo"}
                >
                  Use
                </Button>
              </div>
            </details>
          </>
        )}

        {repoUrl && repoHref && (
          <a
            href={repoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3 shrink-0" />
            {repoLabel}
          </a>
        )}

        {repoUrl && (
          <div className="mt-3 border-t border-border pt-3">
            <label className="mb-1 block text-xs text-muted-foreground">
              Codebase index (precise agent specs)
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={indexCodebase}
                disabled={busy === "index"}
                className="gap-1.5"
              >
                {busy === "index" && <Loader2 className="size-3.5 animate-spin" />}
                {busy === "index"
                  ? "Indexing…"
                  : chunks > 0
                    ? "Re-index"
                    : "Index codebase"}
              </Button>
              {chunks > 0 && (
                <span className="text-[11px] text-muted-foreground">{chunks} chunks</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Domain terms (glossary) --- */}
      <div className="mb-5 rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Domain terms
        </h2>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Product and tech names — sharpens live transcription and fixes spellings when
          organizing the transcript.
        </p>
        <div className="mb-2 flex gap-2">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTerm(term);
              }
            }}
            placeholder="e.g. LiveKit"
            className="h-8"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addTerm(term)}
            disabled={!term.trim()}
          >
            Add
          </Button>
        </div>
        {glossary.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {glossary.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border bg-input/30 px-2 py-0.5 text-[11px]"
              >
                {t}
                <button
                  onClick={() => removeTerm(t)}
                  title="Remove"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {freshSuggestions.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {freshSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => addTerm(s)}
                  className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-solid hover:text-foreground"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- Notes & links --- */}
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
        className="mb-5 self-start"
      >
        Add link
      </Button>

      {/* --- Collected context --- */}
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Meeting context ({items.length})
      </h3>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Notes, links, and screen snapshots the AI uses to generate action items.
      </p>
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
