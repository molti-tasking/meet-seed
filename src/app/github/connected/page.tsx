"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GithubConnectedPage() {
  return (
    <Suspense>
      <Connected />
    </Suspense>
  );
}

function Connected() {
  const params = useSearchParams();
  const room = params.get("room");
  const [closing, setClosing] = useState(true);

  useEffect(() => {
    // Tell the meeting tab (the opener) we connected, then close the popup.
    try {
      window.opener?.postMessage({ type: "github-app-connected" }, window.location.origin);
    } catch {
      /* opener may be cross-origin/closed */
    }
    const t = setTimeout(() => {
      window.close();
      // If the browser blocked close() (not a script-opened window), stop spinning.
      setClosing(false);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="size-10 text-secondary" />
        <h1 className="font-heading mt-4 text-xl font-semibold">GitHub connected</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {closing
            ? "You can close this window — your meeting has been updated."
            : "All set. You can close this window and return to your meeting."}
        </p>
        {room && (
          <Button asChild variant="outline" className="mt-5">
            <a href={`/meeting/${room}`}>Return to meeting</a>
          </Button>
        )}
      </div>
    </main>
  );
}
