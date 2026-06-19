"use client";

import { useState } from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
} from "@livekit/components-react";
import { VideoGrid } from "./VideoGrid";
import { TranscriptPanel } from "./TranscriptPanel";
import { ContextSidebar } from "./ContextSidebar";
import { ActionItemsPanel } from "./ActionItemsPanel";
import { SharedSurface } from "./SharedSurface";

type Meeting = {
  id: string;
  title: string;
  roomName: string;
  githubRepoUrl: string | null;
  context: { id: string; type: string; content: string }[];
  actionItems: {
    id: string;
    title: string;
    description: string;
    fileRefs: string;
    priority: string;
  }[];
};

type Tab = "surface" | "context";

export function MeetingRoom({ meeting }: { meeting: Meeting }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("context");

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <form onSubmit={join} className="w-80 rounded-lg border border-neutral-800 p-6">
          <h1 className="mb-1 text-lg font-semibold">{meeting.title}</h1>
          <p className="mb-4 text-sm text-neutral-400">Join the meeting room.</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mb-3 w-full rounded bg-neutral-800 px-3 py-2 text-sm"
          />
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <button className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500">
            Join
          </button>
          {!serverUrl && error?.includes("not configured") && (
            <p className="mt-3 text-xs text-neutral-500">
              Set LiveKit credentials in .env to enable video.
            </p>
          )}
        </form>
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
      className="h-screen"
    >
      <RoomAudioRenderer />
      <div className="grid h-screen grid-cols-[1fr_360px] grid-rows-[1fr_auto] bg-neutral-950 text-neutral-100">
        {/* Main column: video + shared surface / context tabs */}
        <div className="row-span-2 flex flex-col overflow-hidden">
          <div className="h-1/2 min-h-0 border-b border-neutral-800">
            <VideoGrid />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 border-b border-neutral-800 px-2 pt-2">
              <TabButton active={tab === "context"} onClick={() => setTab("context")}>
                Context
              </TabButton>
              <TabButton active={tab === "surface"} onClick={() => setTab("surface")}>
                Shared surface
              </TabButton>
            </div>
            <div className="min-h-0 flex-1">
              {tab === "context" ? (
                <ContextSidebar
                  meetingId={meeting.id}
                  initialContext={meeting.context}
                  initialRepoUrl={meeting.githubRepoUrl}
                />
              ) : (
                <SharedSurface meetingId={meeting.id} />
              )}
            </div>
          </div>
          <ControlBar />
        </div>

        {/* Right column: transcript over action items */}
        <div className="flex min-h-0 flex-col border-l border-neutral-800">
          <div className="h-1/2 min-h-0 border-b border-neutral-800">
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
      className={`rounded-t px-3 py-1.5 text-xs font-medium ${
        active ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
