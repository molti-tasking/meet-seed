"use client";

import { useEffect, useInsertionEffect, useRef } from "react";

type Options = {
  enabled: boolean;
  // Called for each transcript chunk for the LOCAL mic. `isFinal` marks a
  // finalized segment (interim results stream in before that).
  onTranscript: (text: string, isFinal: boolean) => void;
};

/**
 * Streams the local microphone to Deepgram's realtime API directly from the
 * browser, using a short-lived token minted by /api/deepgram/token. Each
 * participant transcribes their own mic, which gives speaker attribution for
 * free (one mic = one speaker).
 */
export function useDeepgramTranscription({ enabled, onTranscript }: Options) {
  // Keep the latest callback in a ref so changing it doesn't restart the
  // stream. Written in an insertion effect rather than during render.
  const onTranscriptRef = useRef(onTranscript);
  useInsertionEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;

    async function start() {
      const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
      if (!tokenRes.ok) {
        console.error("Deepgram token request failed");
        return;
      }
      const { accessToken } = await tokenRes.json();
      if (cancelled) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error("Microphone access denied", err);
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const params = new URLSearchParams({
        model: "nova-3",
        smart_format: "true",
        interim_results: "true",
        punctuate: "true",
      });
      // Short-lived grant tokens authenticate over the "bearer" subprotocol.
      ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?${params.toString()}`,
        ["bearer", accessToken]
      );

      ws.onopen = () => {
        if (!stream) return;
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };
        recorder.start(250);
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const transcript = data.channel?.alternatives?.[0]?.transcript;
          if (transcript) onTranscriptRef.current(transcript, !!data.is_final);
        } catch {
          // ignore keepalive / non-JSON frames
        }
      };

      ws.onerror = (e) => console.error("Deepgram socket error", e);
    }

    start();

    return () => {
      cancelled = true;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
        ws.close();
      }
    };
  }, [enabled]);
}
