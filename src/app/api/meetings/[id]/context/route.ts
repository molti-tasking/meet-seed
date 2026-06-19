import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const VALID_TYPES = new Set(["note", "link", "github"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const context = await db
    .select()
    .from(schema.contextItems)
    .where(eq(schema.contextItems.meetingId, id))
    .orderBy(asc(schema.contextItems.createdAt));
  return NextResponse.json({ context });
}

// Add a piece of upfront/meanwhile context: a freeform note, a reference link,
// or summarized GitHub repo context.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const type = (body.type ?? "note").toString();
  const content = (body.content ?? "").toString().trim();

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid context type" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const [item] = await db
    .insert(schema.contextItems)
    .values({ meetingId: id, type, content })
    .returning();
  return NextResponse.json({ item }, { status: 201 });
}
