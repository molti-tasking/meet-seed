"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataChannel,
  useLocalParticipant,
} from "@livekit/components-react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeepgramTranscription } from "@/hooks/useDeepgramTranscription";
import { useResourceSync } from "@/hooks/useMeetingSync";

const TOPIC = "transcript";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type FinalLine = { id: string; identity: string; name: string; text: string };
type TranscriptSegment = {
  id: string;
  speakerIdentity: string;
  speakerLabel: string;
  text: string;
};
type WireMessage = {
  kind: "interim" | "final";
  identity: string;
  name: string;
  text: string;
};
// `points` arrives as a JSON-encoded string[] from the DB.
type Topic = { id: string; title: string; summary: string; points: string };
type View = "live" | "topics";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "multi", label: "Auto (DE/EN)" },
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "nl", label: "Dutch" },
];

function toFinalLine(s: TranscriptSegment): FinalLine {
  return { id: s.id, identity: s.speakerIdentity, name: s.speakerLabel, text: s.text };
}

export function TranscriptPanel({
  meetingId,
  initialLanguage,
  initialFinals,
  initialTopics,
  initialGlossary,
}: {
  meetingId: string;
  initialLanguage: string;
  initialFinals: TranscriptSegment[];
  initialTopics: Topic[];
  initialGlossary: string[];
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [language, setLanguage] = useState(initialLanguage || "multi");
  const [view, setView] = useState<View>("live");
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [glossary, setGlossary] = useState<string[]>(initialGlossary);
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  // Finalized lines are DB-authoritative: seeded from persisted history and
  // re-fetched on a sync signal so every participant sees all speakers, even
  // if a live data-channel message was missed.
  const [finals, setFinals] = useState<FinalLine[]>(() => initialFinals.map(toFinalLine));
  // Live (not-yet-final) text per speaker, keyed by participant identity.
  const [interims, setInterims] = useState<Record<string, { name: string; text: string }>>({});
  // Meeting-relative clock; set on mount (Date.now() is impure for render).
  const startRef = useRef<number>(0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  // Auto-scroll the live transcript to the bottom as new lines arrive — but only
  // when the user is already near the bottom, so scrolling up to read history
  // isn't yanked back down.
  const liveScrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  function onLiveScroll() {
    const el = liveScrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const applyMessage = useCallback((m: WireMessage) => {
    if (m.kind === "final") {
      setFinals((prev) => [
        ...prev,
        { id: `${m.identity}-${prev.length}-${m.text.slice(0, 8)}`, identity: m.identity, name: m.name, text: m.text },
      ]);
      setInterims((prev) => ({ ...prev, [m.identity]: { name: m.name, text: "" } }));
    } else {
      setInterims((prev) => ({ ...prev, [m.identity]: { name: m.name, text: m.text } }));
    }
  }, []);

  // Receive transcripts from other participants.
  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      applyMessage(JSON.parse(decoder.decode(msg.payload)) as WireMessage);
    } catch {
      /* ignore */
    }
  });

  const publish = useCallback(
    (m: WireMessage) => {
      try {
        // Swallow async rejections (e.g. "PC manager is closed") when the data
        // transport isn't connected yet.
        const r = send(encoder.encode(JSON.stringify(m)), { topic: TOPIC, reliable: true });
        if (r && typeof (r as Promise<unknown>).then === "function") {
          (r as Promise<unknown>).catch(() => {});
        }
      } catch {
        /* data channel not ready */
      }
    },
    [send]
  );

  // Re-read finalized lines from the DB (the source of truth for all speakers).
  const refetchFinals = useCallback(() => {
    fetch(`/api/meetings/${meetingId}`)
      .then((r) => r.json())
      .then((d) => {
        const segs: TranscriptSegment[] = d.meeting?.transcript ?? [];
        setFinals(segs.map(toFinalLine));
      })
      .catch(() => {});
  }, [meetingId]);
  const notifyChange = useResourceSync("transcript", refetchFinals);

  // Organized topics: DB-authoritative, synced across participants.
  const refetchTopics = useCallback(() => {
    fetch(`/api/meetings/${meetingId}/transcript/topics`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.topics)) setTopics(d.topics);
      })
      .catch(() => {});
  }, [meetingId]);
  const notifyTopics = useResourceSync("transcript-topics", refetchTopics);

  // Glossary feeds Deepgram keyterms (live accuracy) and the organize pass.
  // Re-read it when another participant edits the domain terms.
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
  useResourceSync("glossary", refetchGlossary);

  async function organize() {
    setOrganizing(true);
    setOrganizeError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcript/topics`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to organize");
      setTopics(data.topics ?? []);
      notifyTopics();
    } catch (e) {
      setOrganizeError(e instanceof Error ? e.message : "Failed to organize");
    } finally {
      setOrganizing(false);
    }
  }

  function changeLanguage(value: string) {
    setLanguage(value);
    // Persist as the meeting default (also reconnects the local stream).
    fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: value }),
    }).catch(() => {});
  }

  // Transcribe the local mic and fan results out (local state + others + DB).
  useDeepgramTranscription({
    enabled: true,
    language,
    micEnabled: isMicrophoneEnabled,
    keyterms: glossary,
    onTranscript: (text, isFinal) => {
      const identity = localParticipant.identity;
      const name = localParticipant.name || identity;
      const m: WireMessage = { kind: isFinal ? "final" : "interim", identity, name, text };
      applyMessage(m);
      publish(m);
      if (isFinal) {
        fetch(`/api/meetings/${meetingId}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            speakerIdentity: identity,
            speakerLabel: name,
            startTs: (Date.now() - startRef.current) / 1000,
            isFinal: true,
          }),
        })
          // Persisted — tell other participants to re-read from the DB so they
          // see this line even if the live broadcast above was missed.
          .then(() => notifyChange())
          .catch(() => {});
      }
    },
  });

  const liveInterims = Object.entries(interims).filter(([, v]) => v.text);

  // Keep the live view pinned to the latest line as it streams in.
  useEffect(() => {
    if (view !== "live" || !stickToBottomRef.current) return;
    const el = liveScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finals, interims, view]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          <ViewTab active={view === "live"} onClick={() => setView("live")}>
            Live
          </ViewTab>
          <ViewTab active={view === "topics"} onClick={() => setView("topics")}>
            Topics
          </ViewTab>
        </div>
        {view === "live" ? (
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            title="Transcription language"
            className="h-7 rounded-md border border-input bg-input/30 px-1.5 text-xs"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <Button size="sm" onClick={organize} disabled={organizing} className="h-7 gap-1.5">
            {organizing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {organizing ? "Organizing…" : "Organize"}
          </Button>
        )}
      </div>

      {view === "live" ? (
        <div
          ref={liveScrollRef}
          onScroll={onLiveScroll}
          className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
        >
          {finals.length === 0 && liveInterims.length === 0 && (
            <p className="text-muted-foreground">Start speaking — transcription appears here.</p>
          )}
          {finals.map((line) => (
            <p key={line.id}>
              <span className="font-medium text-primary">{line.name}: </span>
              <span className="text-foreground">{line.text}</span>
            </p>
          ))}
          {liveInterims.map(([identity, v]) => (
            <p key={`interim-${identity}`} className="opacity-60">
              <span className="font-medium text-primary">{v.name}: </span>
              <span className="italic text-muted-foreground">{v.text}</span>
            </p>
          ))}
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
          {organizeError && <p className="text-xs text-destructive">{organizeError}</p>}
          {topics.length === 0 ? (
            <p className="text-muted-foreground">
              Click Organize to group the transcript into topics — terminology corrected and
              filler removed.
            </p>
          ) : (
            topics.map((t) => <TopicCard key={t.id} topic={t} />)
          )}
        </div>
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TopicCard({ topic }: { topic: Topic }) {
  let points: string[] = [];
  try {
    points = JSON.parse(topic.points);
  } catch {
    /* ignore */
  }
  return (
    <details open className="rounded-lg border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {topic.title}
      </summary>
      {topic.summary && (
        <p className="mt-1 text-xs text-muted-foreground">{topic.summary}</p>
      )}
      {points.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {points.map((p, i) => (
            <li key={i} className="text-xs text-foreground">
              {p}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
