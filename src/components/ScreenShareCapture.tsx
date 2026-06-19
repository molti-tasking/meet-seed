"use client";

import { Camera, Loader2 } from "lucide-react";
import { useScreenShareCapture } from "@/hooks/useScreenShareCapture";
import { Button } from "@/components/ui/button";

// Thin bar shown only while the local participant is screen-sharing: feeds
// frames of the shared screen into the meeting's AI context.
export function ScreenShareCapture({ meetingId }: { meetingId: string }) {
  const { isSharing, capturing, auto, setAuto, count, capture } =
    useScreenShareCapture(meetingId);

  if (!isSharing) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-1.5 text-xs">
      <span className="text-muted-foreground">
        Sharing your screen{count > 0 ? ` · ${count} snapshot${count === 1 ? "" : "s"} in context` : ""}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1 text-muted-foreground">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            className="accent-primary"
          />
          Auto-capture
        </label>
        <Button size="sm" variant="secondary" onClick={() => capture()} disabled={capturing} className="h-7 gap-1.5">
          {capturing ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          Capture to context
        </Button>
      </div>
    </div>
  );
}
