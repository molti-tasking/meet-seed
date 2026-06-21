import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Edit an action item (title / description / priority).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Partial<typeof schema.actionItems.$inferInsert> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (["low", "medium", "high"].includes(body.priority)) data.priority = body.priority;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [item] = await db
    .update(schema.actionItems)
    .set(data)
    .where(and(eq(schema.actionItems.id, itemId), eq(schema.actionItems.meetingId, id)))
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Action item not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

// Delete an action item.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;
  await db
    .delete(schema.actionItems)
    .where(and(eq(schema.actionItems.id, itemId), eq(schema.actionItems.meetingId, id)));
  return NextResponse.json({ ok: true });
}
