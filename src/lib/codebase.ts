import zlib from "zlib";
import { Readable } from "stream";
import * as tar from "tar-stream";
import { Octokit } from "@octokit/rest";
import { cosineDistance, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { embedDocuments, embedQuery } from "@/lib/embeddings";

const SKIP_DIRS =
  /(^|\/)(node_modules|\.git|dist|build|\.next|out|coverage|vendor|__pycache__|\.venv)(\/|$)/;
const SKIP_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css))$/;
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|php|c|h|cpp|hpp|cs|swift|scala|sh|sql|css|scss|html|vue|svelte|md|mdx|json|ya?ml|toml|prisma)$/i;

function includePath(p: string): boolean {
  return CODE_EXT.test(p) && !SKIP_DIRS.test(p) && !SKIP_FILES.test(p);
}

// Extract text files from a GitHub .tar.gz archive (in-memory).
function extractFiles(tarGz: Buffer): Promise<{ path: string; content: string }[]> {
  return new Promise((resolve, reject) => {
    const files: { path: string; content: string }[] = [];
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      // GitHub tarballs nest everything under a "<owner>-<repo>-<sha>/" root.
      const rel = header.name.split("/").slice(1).join("/");
      if (header.type !== "file" || !includePath(rel) || (header.size ?? 0) > 100_000) {
        stream.on("end", next);
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        files.push({ path: rel, content: Buffer.concat(chunks).toString("utf8") });
        next();
      });
      stream.on("error", reject);
    });
    extract.on("finish", () => resolve(files));
    extract.on("error", reject);
    Readable.from(zlib.gunzipSync(tarGz)).pipe(extract);
  });
}

// Split a file into overlapping line windows so each chunk fits an embedding.
function chunkFile(path: string, content: string): { path: string; text: string }[] {
  const lines = content.split("\n");
  if (lines.length <= 140) return content.trim() ? [{ path, text: content }] : [];
  const out: { path: string; text: string }[] = [];
  const win = 120;
  const step = 100;
  for (let i = 0; i < lines.length; i += step) {
    const text = lines.slice(i, i + win).join("\n");
    if (text.trim()) out.push({ path, text });
    if (i + win >= lines.length) break;
  }
  return out;
}

export type IngestResult = { files: number; chunks: number; truncated: boolean };

// Download, chunk, embed, and store a repo's code for a meeting.
export async function ingestRepo(
  meetingId: string,
  owner: string,
  repo: string,
  token?: string
): Promise<IngestResult> {
  const octokit = new Octokit({ auth: token });
  // Empty ref → the repo's default branch.
  const res = await octokit.repos.downloadTarballArchive({ owner, repo, ref: "" });
  const buf = Buffer.from(res.data as ArrayBuffer);

  const files = await extractFiles(buf);
  let chunks = files.flatMap((f) => chunkFile(f.path, f.content));

  const MAX_CHUNKS = 1500;
  const truncated = chunks.length > MAX_CHUNKS;
  if (truncated) chunks = chunks.slice(0, MAX_CHUNKS);

  const vectors = await embedDocuments(chunks.map((c) => `${c.path}\n\n${c.text}`));

  // Replace any prior index for this meeting.
  await db.delete(schema.codeChunks).where(eq(schema.codeChunks.meetingId, meetingId));

  const rows = chunks.map((c, i) => ({
    meetingId,
    path: c.path,
    content: c.text,
    embedding: vectors[i],
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(schema.codeChunks).values(rows.slice(i, i + 200));
  }

  await db
    .update(schema.meetings)
    .set({ codebaseChunks: chunks.length })
    .where(eq(schema.meetings.id, meetingId));

  return { files: files.length, chunks: chunks.length, truncated };
}

// Retrieve the code chunks most similar to a query.
export async function retrieveRelevantCode(
  meetingId: string,
  query: string,
  k = 8
): Promise<{ path: string; content: string }[]> {
  const qvec = await embedQuery(query);
  const distance = cosineDistance(schema.codeChunks.embedding, qvec);
  return db
    .select({ path: schema.codeChunks.path, content: schema.codeChunks.content })
    .from(schema.codeChunks)
    .where(eq(schema.codeChunks.meetingId, meetingId))
    .orderBy(distance)
    .limit(k);
}
