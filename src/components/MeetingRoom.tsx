"use client";

import { useEffect, useState } from "react";
import "@livekit/components-styles";
import { LiveKitRoom, RoomAudioRenderer, ControlBar } from "@livekit/components-react";
import { Loader2 } from "lucide-react";
import { VideoGrid } from "./VideoGrid";
import { TranscriptPanel } from "./TranscriptPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ActionItemsPanel } from "./ActionItemsPanel";
import { SharedSurface } from "./SharedSurface";
import { AgentsPanel } from "./AgentsPanel";
import { RolesPanel } from "./RolesPanel";
import { ScreenShareCapture } from "./ScreenShareCapture";
import { UsageFooter } from "./UsageFooter";
import { useMeetingRoles } from "@/hooks/useMeetingRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type Meeting = {
  id: string;
  title: string;
  roomName: string;
  githubRepoUrl: string | null;
  githubInstallationId: string | null;
  codebaseChunks: number;
  context: { id: string; type: string; content: string }[];
  actionItems: {
    id: string;
    title: string;
    description: string;
    fileRefs: string;
    priority: string;
  }[];
};

export function MeetingRoom({ meeting }: { meeting: Meeting }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // The browser that created the meeting holds the owner marker. Read after
  // mount (localStorage isn't available during SSR).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOwner(Boolean(localStorage.getItem(`owner:${meeting.id}`)));
    } catch {
      /* no localStorage */
    }
  }, [meeting.id]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJoining(true);
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: meeting.roomName, name: name || "Guest" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not join");
        return;
      }
      setToken(data.token);
      setServerUrl(data.serverUrl);
    } finally {
      setJoining(false);
    }
  }

  if (!token || !serverUrl) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-heading">{meeting.title}</CardTitle>
            <CardDescription>
              Join the meeting room{isOwner ? " — you're the owner" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={join} className="space-y-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" disabled={joining} className="w-full gap-2">
                {joining && <Loader2 className="size-4 animate-spin" />}
                {joining ? "Joining…" : "Join"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video
      data-lk-theme="default"
      className="dark h-screen"
      onError={(e) => console.error("[livekit] room error:", e.message, e)}
      onConnected={() => console.info("[livekit] connected", serverUrl)}
      onDisconnected={(reason) => console.warn("[livekit] disconnected", reason)}
    >
      <RoomAudioRenderer />
      <MeetingWorkspace meeting={meeting} isOwner={isOwner} />
    </LiveKitRoom>
  );
}

type Tab = "context" | "people" | "agents" | "surface";

function MeetingWorkspace({ meeting, isOwner }: { meeting: Meeting; isOwner: boolean }) {
  const { myRole, roleMap, setRole, participants, localIdentity } =
    useMeetingRoles(isOwner);
  const technical = myRole === "owner" || myRole === "technical";
  const [tab, setTab] = useState<Tab>("context");

  // Derive the visible tab so a role change can't strand someone on a tab they
  // no longer have access to (no setState-in-effect needed).
  const tabAllowed =
    tab === "context" ||
    tab === "surface" ||
    (tab === "agents" && technical) ||
    (tab === "people" && isOwner);
  const activeTab: Tab = tabAllowed ? tab : "context";

  return (
    <div className="grid h-screen grid-cols-[1fr_380px] grid-rows-[1fr_auto] bg-background text-foreground">
      <div className="row-span-2 flex flex-col overflow-hidden">
        <div className="h-1/2 min-h-0 border-b border-border">
          <VideoGrid />
        </div>
        <ScreenShareCapture meetingId={meeting.id} />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 border-b border-border px-2 pt-2">
            <TabButton active={activeTab === "context"} onClick={() => setTab("context")}>
              Context
            </TabButton>
            {isOwner && (
              <TabButton active={activeTab === "people"} onClick={() => setTab("people")}>
                People
              </TabButton>
            )}
            {technical && (
              <TabButton active={activeTab === "agents"} onClick={() => setTab("agents")}>
                Agents
              </TabButton>
            )}
            <TabButton active={activeTab === "surface"} onClick={() => setTab("surface")}>
              Shared surface
            </TabButton>
          </div>
          <div className="min-h-0 flex-1">
            {activeTab === "context" && (
              <ContextSidebar
                meetingId={meeting.id}
                initialContext={meeting.context}
                initialRepoUrl={meeting.githubRepoUrl}
                githubInstallationId={meeting.githubInstallationId}
                codebaseChunks={meeting.codebaseChunks}
              />
            )}
            {activeTab === "people" && isOwner && (
              <RolesPanel
                participants={participants}
                roleMap={roleMap}
                setRole={setRole}
                localIdentity={localIdentity}
              />
            )}
            {activeTab === "agents" && technical && <AgentsPanel meetingId={meeting.id} />}
            {activeTab === "surface" && <SharedSurface meetingId={meeting.id} />}
          </div>
        </div>
        <ControlBar />
        {technical && <UsageFooter meetingId={meeting.id} />}
      </div>

      <div className="flex min-h-0 flex-col border-l border-border">
        <div className="h-1/2 min-h-0 border-b border-border">
          <TranscriptPanel meetingId={meeting.id} />
        </div>
        <div className="h-1/2 min-h-0">
          <ActionItemsPanel meetingId={meeting.id} initialItems={meeting.actionItems} />
        </div>
      </div>
    </div>
  );
}

function TabButton({
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
      className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
