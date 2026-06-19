import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export default async function DashboardPage() {
  const rows = await db
    .select({
      meetingId: schema.usageEvents.meetingId,
      title: schema.meetings.title,
      roomName: schema.meetings.roomName,
      inputTokens: sql<number>`coalesce(sum(${schema.usageEvents.inputTokens}),0)`,
      outputTokens: sql<number>`coalesce(sum(${schema.usageEvents.outputTokens}),0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${schema.usageEvents.cacheReadTokens}),0)`,
      costUsd: sql<number>`coalesce(sum(${schema.usageEvents.costUsd}),0)`,
    })
    .from(schema.usageEvents)
    .innerJoin(schema.meetings, eq(schema.usageEvents.meetingId, schema.meetings.id))
    .groupBy(schema.usageEvents.meetingId, schema.meetings.title, schema.meetings.roomName)
    .orderBy(desc(sql`coalesce(sum(${schema.usageEvents.costUsd}),0)`));

  const totals = rows.reduce(
    (a, r) => ({
      input: a.input + Number(r.inputTokens),
      output: a.output + Number(r.outputTokens),
      cost: a.cost + Number(r.costUsd),
    }),
    { input: 0, output: 0, cost: 0 }
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-heading mt-3 text-3xl font-bold tracking-tight">AI usage</h1>
      <p className="mt-2 text-muted-foreground">
        Claude token consumption and estimated cost across all meetings (action items,
        screen vision, and coding agents). Deepgram and LiveKit bill by minutes and are
        not included here.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-4">
        <Stat label="Total cost (est.)" value={`$${totals.cost.toFixed(2)}`} />
        <Stat label="Input tokens" value={fmt(totals.input)} />
        <Stat label="Output tokens" value={fmt(totals.output)} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="font-heading text-base">Per meeting</CardTitle>
          <CardDescription>Ranked by estimated cost.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Meeting</th>
                    <th className="py-2 pr-4 text-right font-medium">Input</th>
                    <th className="py-2 pr-4 text-right font-medium">Output</th>
                    <th className="py-2 pr-4 text-right font-medium">Cache read</th>
                    <th className="py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.meetingId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/meeting/${r.roomName}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(Number(r.inputTokens))}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(Number(r.outputTokens))}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmt(Number(r.cacheReadTokens))}
                      </td>
                      <td className="py-2 text-right tabular-nums">${Number(r.costUsd).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-heading mt-1 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
