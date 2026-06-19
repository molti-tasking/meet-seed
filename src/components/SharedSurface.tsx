"use client";

import { useEffect, useRef, useState } from "react";
import { record } from "rrweb";
import type { eventWithTime } from "@rrweb/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * An in-app "shared surface": load a URL in an iframe and/or use the scratch
 * area, while rrweb records DOM mutations and interactions on this page. Events
 * are batched and persisted so the session can be replayed later.
 *
 * Limitation: rrweb can only record same-origin DOM. Cross-origin sites loaded
 * in the iframe are shown but their internal DOM is NOT captured — that needs an
 * injected recorder script or a browser extension (future work).
 */
export function SharedSurface({ meetingId }: { meetingId: string }) {
  const [url, setUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const bufferRef = useRef<eventWithTime[]>([]);

  useEffect(() => {
    if (!recording) return;

    const stopFn = record({
      emit: (event) => {
        bufferRef.current.push(event);
        setEventCount((c) => c + 1);
      },
    });

    // Flush the buffer to the server every 5s.
    const flush = () => {
      if (bufferRef.current.length === 0) return;
      const events = bufferRef.current.splice(0, bufferRef.current.length);
      fetch(`/api/meetings/${meetingId}/dom-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      }).catch(() => {});
    };
    const interval = setInterval(flush, 5000);

    return () => {
      clearInterval(interval);
      stopFn?.();
      flush();
    };
  }, [recording, meetingId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://site-to-discuss.example"
          className="h-8 flex-1"
        />
        <Button size="sm" variant="secondary" onClick={() => setLoadedUrl(url)}>
          Load
        </Button>
        <Button
          size="sm"
          variant={recording ? "destructive" : "default"}
          onClick={() => setRecording((r) => !r)}
        >
          {recording ? `Recording (${eventCount})` : "Record"}
        </Button>
      </div>
      <div className="flex-1 bg-white">
        {loadedUrl ? (
          <iframe src={loadedUrl} className="h-full w-full" title="shared surface" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Load a URL to browse together, then hit Record to capture interactions.
          </div>
        )}
      </div>
    </div>
  );
}
