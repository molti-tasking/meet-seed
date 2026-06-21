"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataChannel,
  useLocalParticipant,
} from "@livekit/components-react";
import { useDeepgramTranscription } from "@/hooks/useDeepgramTranscription";

const TOPIC = "transcript";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type FinalLine = { id: string; identity: string; name: string; text: string };
type WireMessage = {
  kind: "interim" | "final";
  identity: string;
  name: string;
  text: string;
};

const LANGUAGES: { value: string; label: string }[] = [
  { value: "multi", label: "Auto (DE/EN)" },
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "nl", label: "Dutch" },
];

export function TranscriptPanel({
  meetingId,
  initialLanguage,
}: {
  meetingId: string;
  initialLanguage: string;
}) {
  const { localParticipant } = useLocalParticipant();
  const [language, setLanguage] = useState(initialLanguage || "multi");
  const [finals, setFinals] = useState<FinalLine[]>([]);
  // Live (not-yet-final) text per speaker, keyed by participant identity.
  const [interims, setInterims] = useState<Record<string, { name: string; text: string }>>({});
  // Meeting-relative clock; set on mount (Date.now() is impure for render).
  const startRef = useRef<number>(0);
  useEffect(() => {
    startRef.current = Date.now();
  }, []);

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
        }).catch(() => {});
      }
    },
  });

  const liveInterims = Object.entries(interims).filter(([, v]) => v.text);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live transcript
        </h2>
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
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
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
    </div>
  );
}
