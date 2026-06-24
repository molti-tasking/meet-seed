"use client";

import { useEffect, useInsertionEffect, useRef } from "react";

type Options = {
  enabled: boolean;
  // Deepgram language: "multi" (auto DE/EN/…), or a code like "de", "en".
  language: string;
  // Mirrors the LiveKit microphone state. Audio is only streamed to Deepgram
  // while this is true, so muting the mic stops transcription. Toggling it does
  // NOT tear down the socket — we just stop/resume sending chunks.
  micEnabled: boolean;
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
export function useDeepgramTranscription({
  enabled,
  language,
  micEnabled,
  onTranscript,
}: Options) {
  // Keep the latest callback in a ref so changing it doesn't restart the
  // stream. Written in an insertion effect rather than during render.
  const onTranscriptRef = useRef(onTranscript);
  useInsertionEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  // Mirror the mic state into a ref so muting/unmuting gates audio sending
  // without re-running the effect (which would reconnect the socket).
  const micEnabledRef = useRef(micEnabled);
  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;

    async function start() {
      const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
      if (!tokenRes.ok) {
        const body = await tokenRes.text().catch(() => "");
        console.error(
          `[deepgram] token request failed (${tokenRes.status}) — transcription off. ${body.slice(0, 200)}`
        );
        return;
      }
      console.info("[deepgram] token acquired, opening transcription stream");
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
        language, // "multi" handles German + English (and code-switching)
        smart_format: "true",
        interim_results: "true",
        punctuate: "true",
        endpointing: "100", // recommended for multilingual/code-switching
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
          // Only stream audio while the mic is on — muting stops transcription.
          if (micEnabledRef.current && e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
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
  }, [enabled, language]);
}
