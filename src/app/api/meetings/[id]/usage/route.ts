import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Per-meeting usage totals + a breakdown by kind (for the live footer).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select({
      kind: schema.usageEvents.kind,
      inputTokens: sql<number>`coalesce(sum(${schema.usageEvents.inputTokens}),0)`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageEvents.outputTokens}),0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${schema.usageEvents.cacheReadTokens}),0)`,
      costUsd: sql<number>`coalesce(sum(${schema.usageEvents.costUsd}),0)`,
    })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.meetingId, id))
    .groupBy(schema.usageEvents.kind);

  const totals = rows.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + Number(r.inputTokens),
      outputTokens: acc.outputTokens + Number(r.outputTokens),
      cacheReadTokens: acc.cacheReadTokens + Number(r.cacheReadTokens),
      costUsd: acc.costUsd + Number(r.costUsd),
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 }
  );

  return NextResponse.json({ totals, byKind: rows });
}
