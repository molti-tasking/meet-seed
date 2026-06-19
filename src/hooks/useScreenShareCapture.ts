"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";

/**
 * When the local participant is screen-sharing, samples frames from the shared
 * track and sends them to the vision endpoint, which turns them into meeting
 * context items. Captures automatically on an interval (toggleable) plus a
 * manual capture.
 */
export function useScreenShareCapture(meetingId: string) {
  const { localParticipant } = useLocalParticipant();
  const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const trackSid = pub?.trackSid;
  const isSharing = Boolean(pub?.videoTrack);

  const [capturing, setCapturing] = useState(false);
  const [auto, setAuto] = useState(true);
  const [count, setCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Bind a hidden <video> to the current screen-share track for frame grabbing.
  useEffect(() => {
    const mt = localParticipant
      .getTrackPublication(Track.Source.ScreenShare)
      ?.videoTrack?.mediaStreamTrack;
    if (!mt) {
      videoRef.current = null;
      return;
    }
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream([mt]);
    v.play().catch(() => {});
    videoRef.current = v;
    return () => {
      v.srcObject = null;
      if (videoRef.current === v) videoRef.current = null;
    };
  }, [localParticipant, trackSid]);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / v.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

    setCapturing(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/vision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (res.ok) setCount((c) => c + 1);
    } catch {
      /* ignore transient failures */
    } finally {
      setCapturing(false);
    }
  }, [meetingId]);

  // Auto-capture every 25s while sharing.
  useEffect(() => {
    if (!isSharing || !auto) return;
    const t = setInterval(() => void capture(), 25000);
    return () => clearInterval(t);
  }, [isSharing, auto, capture]);

  return { isSharing, capturing, auto, setAuto, count, capture };
}
