import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Edit a feature request (status transitions, or tweak the title/detail/kind).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; frId: string }> }
) {
  const { frId } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Partial<typeof schema.featureRequests.$inferInsert> = {};
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.detail === "string") data.detail = body.detail;
  if (typeof body.kind === "string") data.kind = body.kind;

  const [request] = await db
    .update(schema.featureRequests)
    .set(data)
    .where(eq(schema.featureRequests.id, frId))
    .returning();

  return NextResponse.json({ request });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; frId: string }> }
) {
  const { frId } = await params;
  await db
    .delete(schema.featureRequests)
    .where(eq(schema.featureRequests.id, frId));
  return NextResponse.json({ ok: true });
}
