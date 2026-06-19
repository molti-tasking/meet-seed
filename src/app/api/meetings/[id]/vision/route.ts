import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { describeScreen } from "@/lib/ai";

// Turn a screen-share frame into a textual context item via Claude vision.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const image = (body.image ?? "").toString();
  // Expect a data URL: data:image/jpeg;base64,XXXX
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    return NextResponse.json(
      { error: "image must be a base64 data URL (jpeg/png/webp)" },
      { status: 400 }
    );
  }

  let description: string;
  try {
    description = await describeScreen(match[2], match[1]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Vision request failed" },
      { status: 502 }
    );
  }

  if (!description) {
    return NextResponse.json({ skipped: true });
  }

  const [item] = await db
    .insert(schema.contextItems)
    .values({ meetingId: id, type: "screen", content: description })
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}
