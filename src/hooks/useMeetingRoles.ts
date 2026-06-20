"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataChannel,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";

export type Role = "owner" | "technical" | "business";
export type AssignableRole = "technical" | "business";

const TOPIC = "roles";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Per-meeting view roles. The owner assigns each participant a Business or
 * Technical view; the map is broadcast over the LiveKit data channel so every
 * client can gate its own UI. Non-owners default to Business.
 *
 * Note: this is view separation, not a security boundary — without auth the
 * server can't verify roles, so a determined user could call the API directly.
 */
export function useMeetingRoles(isOwner: boolean) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [roleMap, setRoleMap] = useState<Record<string, AssignableRole>>({});

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      setRoleMap(JSON.parse(decoder.decode(msg.payload)));
    } catch {
      /* ignore */
    }
  });

  const broadcast = useCallback(
    (map: Record<string, AssignableRole>) => {
      try {
        send(encoder.encode(JSON.stringify(map)), { topic: TOPIC, reliable: true });
      } catch {
        /* data channel not ready */
      }
    },
    [send]
  );

  const setRole = useCallback(
    (identity: string, role: AssignableRole) => {
      setRoleMap((prev) => {
        const next = { ...prev, [identity]: role };
        broadcast(next);
        return next;
      });
    },
    [broadcast]
  );

  // Owner re-broadcasts the current map whenever the participant set changes, so
  // newcomers receive it. Read the latest map from a ref to avoid re-running on
  // every map change.
  const mapRef = useRef(roleMap);
  useEffect(() => {
    mapRef.current = roleMap;
  });
  useEffect(() => {
    if (isOwner) broadcast(mapRef.current);
  }, [isOwner, participants.length, broadcast]);

  const myIdentity = localParticipant.identity;
  const myRole: Role = isOwner ? "owner" : roleMap[myIdentity] ?? "business";

  return { myRole, isOwner, roleMap, setRole, participants, localIdentity: myIdentity };
}
