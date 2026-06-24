import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Words that are structure, not domain terms — never suggest these.
const STOP = new Set([
  "index",
  "route",
  "page",
  "layout",
  "src",
  "app",
  "lib",
  "api",
  "components",
  "component",
  "hooks",
  "hook",
  "utils",
  "util",
  "types",
  "type",
  "test",
  "tests",
  "spec",
  "config",
  "main",
  "default",
  "styles",
  "style",
  "public",
  "assets",
  "node_modules",
  "dist",
  "build",
]);

function add(set: Set<string>, raw: string) {
  const term = raw.trim();
  if (term.length < 3 || term.length > 40) return;
  if (STOP.has(term.toLowerCase())) return;
  set.add(term);
}

// Suggest candidate domain terms for the glossary, derived deterministically
// from the connected repo's indexed file paths and the meeting's context items.
// No AI call — cheap and predictable.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [chunks, context] = await Promise.all([
    db
      .select({ path: schema.codeChunks.path })
      .from(schema.codeChunks)
      .where(eq(schema.codeChunks.meetingId, id)),
    db
      .select({ content: schema.contextItems.content })
      .from(schema.contextItems)
      .where(eq(schema.contextItems.meetingId, id)),
  ]);

  const terms = new Set<string>();

  // From repo paths: directory segments and filename stems.
  for (const { path } of chunks) {
    const segments = path.split("/").filter(Boolean);
    for (const seg of segments) {
      const stem = seg.replace(/\.[^.]+$/, ""); // strip extension
      add(terms, stem);
    }
  }

  // From context: PascalCase / camelCase identifiers look like domain nouns.
  const identifier = /\b[A-Z][a-zA-Z0-9]{2,}\b|\b[a-z]+[A-Z][a-zA-Z0-9]+\b/g;
  for (const { content } of context) {
    for (const m of content.matchAll(identifier)) add(terms, m[0]);
  }

  return NextResponse.json({ terms: Array.from(terms).slice(0, 30) });
}
