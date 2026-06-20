// Voyage AI embeddings (voyage-code-3, 1024-dim) — code-specialized retrieval.
const MODEL = "voyage-code-3";
const DIMENSIONS = 1024;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

async function embed(
  inputs: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not configured");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: inputs,
      input_type: inputType,
      output_dimension: DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// Embed documents in batches (Voyage caps inputs + tokens per request).
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    out.push(...(await embed(batch, "document")));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], "query");
  return vec;
}
