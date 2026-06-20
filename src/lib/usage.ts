import { db, schema } from "@/lib/db";

// Price per 1M tokens (USD). Cache read ≈ 0.1× input; cache write ≈ 1.25× input.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export type TokenCounts = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

function costUsd(model: string, t: Required<TokenCounts>): number {
  const p = PRICING[model] ?? PRICING["claude-opus-4-8"];
  const inM = p.in / 1_000_000;
  const outM = p.out / 1_000_000;
  return (
    t.inputTokens * inM +
    t.outputTokens * outM +
    t.cacheReadTokens * inM * 0.1 +
    t.cacheCreationTokens * inM * 1.25
  );
}

// Record a single model call's usage against a meeting. Best-effort: never let
// usage bookkeeping break the actual request.
export async function recordUsage(
  meetingId: string,
  kind: "action_items" | "vision" | "coding_agent" | "spec",
  model: string,
  tokens: TokenCounts
): Promise<void> {
  const t = {
    inputTokens: tokens.inputTokens ?? 0,
    outputTokens: tokens.outputTokens ?? 0,
    cacheReadTokens: tokens.cacheReadTokens ?? 0,
    cacheCreationTokens: tokens.cacheCreationTokens ?? 0,
  };
  try {
    await db.insert(schema.usageEvents).values({
      meetingId,
      kind,
      model,
      ...t,
      costUsd: costUsd(model, t),
    });
  } catch {
    /* don't fail the caller over telemetry */
  }
}
