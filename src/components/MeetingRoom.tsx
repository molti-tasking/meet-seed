"use client";

import { useState } from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
} from "@livekit/components-react";
import { Loader2 } from "lucide-react";
import { VideoGrid } from "./VideoGrid";
import { TranscriptPanel } from "./TranscriptPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ActionItemsPanel } from "./ActionItemsPanel";
import { SharedSurface } from "./SharedSurface";
import { AgentsPanel } from "./AgentsPanel";
import { ScreenShareCapture } from "./ScreenShareCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Meeting = {
  id: string;
  title: string;
  roomName: string;
  githubRepoUrl: string | null;
  githubInstallationId: string | null;
  context: { id: string; type: string; content: string }[];
  actionItems: {
    id: string;
    title: string;
    description: string;
    fileRefs: string;
    priority: string;
  }[];
};

type Tab = "surface" | "context" | "agents";

export function MeetingRoom({ meeting }: { meeting: Meeting }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState<Tab>("context");

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
            <CardDescription>Join the meeting room.</CardDescription>
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
    >
      <RoomAudioRenderer />
      <div className="grid h-screen grid-cols-[1fr_380px] grid-rows-[1fr_auto] bg-background text-foreground">
        {/* Main column: video + shared surface / context tabs */}
        <div className="row-span-2 flex flex-col overflow-hidden">
          <div className="h-1/2 min-h-0 border-b border-border">
            <VideoGrid />
          </div>
          <ScreenShareCapture meetingId={meeting.id} />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 border-b border-border px-2 pt-2">
              <TabButton active={tab === "context"} onClick={() => setTab("context")}>
                Context
              </TabButton>
              <TabButton active={tab === "agents"} onClick={() => setTab("agents")}>
                Agents
              </TabButton>
              <TabButton active={tab === "surface"} onClick={() => setTab("surface")}>
                Shared surface
              </TabButton>
            </div>
            <div className="min-h-0 flex-1">
              {tab === "context" && (
                <ContextSidebar
                  meetingId={meeting.id}
                  initialContext={meeting.context}
                  initialRepoUrl={meeting.githubRepoUrl}
                  githubInstallationId={meeting.githubInstallationId}
                />
              )}
              {tab === "agents" && <AgentsPanel meetingId={meeting.id} />}
              {tab === "surface" && <SharedSurface meetingId={meeting.id} />}
            </div>
          </div>
          <ControlBar />
        </div>

        {/* Right column: transcript over action items */}
        <div className="flex min-h-0 flex-col border-l border-border">
          <div className="h-1/2 min-h-0 border-b border-border">
            <TranscriptPanel meetingId={meeting.id} />
          </div>
          <div className="h-1/2 min-h-0">
            <ActionItemsPanel meetingId={meeting.id} initialItems={meeting.actionItems} />
          </div>
        </div>
      </div>
    </LiveKitRoom>
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
        active
          ? "bg-card text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
