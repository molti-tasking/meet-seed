import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Turn a free-text title into a URL-safe room slug, with a short random suffix
// so two meetings with the same title don't collide.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : suffix;
}

export async function GET() {
  const meetings = await db
    .select()
    .from(schema.meetings)
    .orderBy(desc(schema.meetings.createdAt))
    .limit(50);
  return NextResponse.json({ meetings });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim() || "Untitled meeting";
  const githubRepoUrl = body.githubRepoUrl?.toString().trim() || null;

  const [meeting] = await db
    .insert(schema.meetings)
    .values({ title, roomName: slugify(title), githubRepoUrl })
    .returning();

  return NextResponse.json({ meeting }, { status: 201 });
}
