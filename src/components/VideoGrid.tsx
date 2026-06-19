"use client";

import {
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

// Camera grid by default; switches to presentation/focus mode (big shared
// screen + a strip of camera tiles) whenever someone shares their screen.
export function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const screen = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);

  if (screen.length > 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <ParticipantTile trackRef={screen[0]} className="h-full" />
        </div>
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto border-t border-border p-2">
          {cameras.map((c) => (
            <div key={c.participant.identity + c.source} className="aspect-video h-full shrink-0">
              <ParticipantTile trackRef={c} className="h-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <GridLayout tracks={cameras} className="h-full">
      <ParticipantTile />
    </GridLayout>
  );
}
