import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { classifyFeatureRequest } from "@/lib/ai";
import { log } from "@/lib/logger";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requests = await db
    .select()
    .from(schema.featureRequests)
    .where(eq(schema.featureRequests.meetingId, id))
    .orderBy(desc(schema.featureRequests.createdAt));
  return NextResponse.json({ requests });
}

// Capture a piece of in-meeting product feedback about the tool itself. When
// Anthropic is configured, classify + tidy it into a crisp backlog entry;
// otherwise store the raw text as a feature.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = (body.text ?? "").toString().trim();
  if (!text) {
    return NextResponse.json({ error: "Empty request" }, { status: 400 });
  }

  let kind = "feature";
  let title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  let detail = text.length > 80 ? text : "";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const c = await classifyFeatureRequest(id, text);
      kind = c.kind;
      title = c.title;
      detail = c.detail;
    } catch (err) {
      log.warn("feature-requests: classify failed, storing raw", {
        meetingId: id,
        err,
      });
    }
  }

  const [request] = await db
    .insert(schema.featureRequests)
    .values({ meetingId: id, kind, title, detail })
    .returning();

  return NextResponse.json({ request }, { status: 201 });
}
