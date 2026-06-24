"use client";

import { useCallback, useEffect, useInsertionEffect, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";

const TOPIC = "sync";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Keeps a DB-backed resource in sync across meeting participants.
 *
 * Whoever mutates a shared resource calls the returned `notifyChange()`, which
 * broadcasts a tiny `{ resource }` signal over the LiveKit data channel (the
 * same transport already used for transcript and roles). Every other client
 * listening for that resource re-fetches from the server. A slow interval poll
 * acts as a safety net so a dropped signal can't leave anyone stale.
 *
 * The signal carries no payload — it only says "this changed, go re-read it" —
 * which keeps the server (its database) the single source of truth.
 */
export function useResourceSync(
  resource: string,
  refetch: () => void,
  intervalMs = 30000
) {
  // Keep the latest refetch in a ref so re-renders don't re-subscribe or reset
  // the poll. Written in an insertion effect rather than during render.
  const refetchRef = useRef(refetch);
  useInsertionEffect(() => {
    refetchRef.current = refetch;
  });

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const data = JSON.parse(decoder.decode(msg.payload)) as { resource?: string };
      if (data.resource === resource) refetchRef.current();
    } catch {
      /* ignore malformed frames */
    }
  });

  // Safety-net poll: catches anything a missed data-channel message dropped.
  useEffect(() => {
    const interval = setInterval(() => refetchRef.current(), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  const notifyChange = useCallback(() => {
    try {
      // send() can reject asynchronously when the data transport isn't ready
      // yet (e.g. solo in the room) — swallow it like the other publishers do.
      const r = send(encoder.encode(JSON.stringify({ resource })), {
        topic: TOPIC,
        reliable: true,
      });
      if (r && typeof (r as Promise<unknown>).then === "function") {
        (r as Promise<unknown>).catch(() => {});
      }
    } catch {
      /* data channel not ready */
    }
  }, [send, resource]);

  return notifyChange;
}
