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

export function TranscriptPanel({ meetingId }: { meetingId: string }) {
  const { localParticipant } = useLocalParticipant();
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

  // Transcribe the local mic and fan results out (local state + others + DB).
  useDeepgramTranscription({
    enabled: true,
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
      <h2 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Live transcript
      </h2>
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
