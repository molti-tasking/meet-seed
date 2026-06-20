"use client";

import type { Participant } from "livekit-client";
import { Crown, Wrench, User } from "lucide-react";
import type { AssignableRole } from "@/hooks/useMeetingRoles";
import { Button } from "@/components/ui/button";

// Owner-only: assign each participant a Business or Technical view.
export function RolesPanel({
  participants,
  roleMap,
  setRole,
  localIdentity,
}: {
  participants: Participant[];
  roleMap: Record<string, AssignableRole>;
  setRole: (identity: string, role: AssignableRole) => void;
  localIdentity: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        People &amp; views
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Business sees the meeting, transcript, context, and action items. Technical
        also sees the coding agents, merge requests, and AI usage.
      </p>
      <ul className="space-y-2">
        {participants.map((p) => {
          const isSelf = p.identity === localIdentity;
          const role: AssignableRole = roleMap[p.identity] ?? "business";
          return (
            <li
              key={p.identity}
              className="flex items-center justify-between gap-2 rounded-md border bg-card p-2"
            >
              <span className="flex items-center gap-1.5 text-sm">
                {isSelf ? <Crown className="size-3.5 text-primary" /> : <User className="size-3.5 text-muted-foreground" />}
                {p.name || p.identity}
                {isSelf && <span className="text-xs text-muted-foreground">(you · owner)</span>}
              </span>
              {!isSelf && (
                <div className="inline-flex rounded-md border p-0.5">
                  <RoleButton active={role === "business"} onClick={() => setRole(p.identity, "business")}>
                    <User className="size-3" /> Business
                  </RoleButton>
                  <RoleButton active={role === "technical"} onClick={() => setRole(p.identity, "technical")}>
                    <Wrench className="size-3" /> Technical
                  </RoleButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className="h-6 gap-1 px-2 text-[11px]"
    >
      {children}
    </Button>
  );
}
