"use client";

import { useEffect, useState } from "react";

type Totals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

// Small live readout of this meeting's AI token/cost usage.
export function UsageFooter({ meetingId }: { meetingId: string }) {
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`/api/meetings/${meetingId}/usage`)
        .then((r) => r.json())
        .then((d) => d.totals && setTotals(d.totals))
        .catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [meetingId]);

  if (!totals) return null;

  return (
    <div className="flex items-center justify-end gap-3 border-t border-border bg-card px-4 py-1 text-[11px] text-muted-foreground">
      <span>AI usage</span>
      <span className="tabular-nums">↑ {fmt(totals.inputTokens)} in</span>
      <span className="tabular-nums">↓ {fmt(totals.outputTokens)} out</span>
      <span className="font-medium tabular-nums text-foreground">
        ${totals.costUsd.toFixed(3)}
      </span>
    </div>
  );
}
