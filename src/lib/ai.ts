import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "@/lib/usage";

// Single shared client; reads ANTHROPIC_API_KEY from the environment.
const anthropic = new Anthropic();

// Latest Opus-tier model. Swap to "claude-sonnet-4-6" for cheaper/faster runs.
const MODEL = "claude-opus-4-8";

export type GeneratedActionItem = {
  title: string;
  description: string;
  fileRefs: string[];
  priority: "low" | "medium" | "high";
};

// JSON schema the model is constrained to (structured outputs).
const ACTION_ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          fileRefs: { type: "array", items: { type: "string" } },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "description", "fileRefs", "priority"],
      },
    },
  },
  required: ["actionItems"],
} as const;

export type MeetingContextBundle = {
  title: string;
  transcript: { speakerLabel: string; text: string }[];
  context: { type: string; content: string }[];
};

function buildPrompt(bundle: MeetingContextBundle): string {
  const transcript =
    bundle.transcript.map((s) => `${s.speakerLabel}: ${s.text}`).join("\n") ||
    "(no transcript captured)";

  const context =
    bundle.context
      .map((c) => `--- ${c.type.toUpperCase()} ---\n${c.content}`)
      .join("\n\n") || "(no additional context)";

  return [
    `You are assisting a software consulting meeting titled "${bundle.title}".`,
    "Below is the meeting transcript and any attached context (notes, reference links, and GitHub repo summary).",
    "Produce concrete, technical action items for the next steps. Be specific:",
    "reference relevant files from the GitHub context in fileRefs when applicable,",
    "and set priority based on urgency and impact.",
    "",
    "=== TRANSCRIPT ===",
    transcript,
    "",
    "=== CONTEXT ===",
    context,
  ].join("\n");
}

export async function generateActionItems(
  meetingId: string,
  bundle: MeetingContextBundle
): Promise<GeneratedActionItem[]> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: ACTION_ITEMS_SCHEMA } },
    messages: [{ role: "user", content: buildPrompt(bundle) }],
  });

  await recordUsage(meetingId, "action_items", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(text) as { actionItems: GeneratedActionItem[] };
  return parsed.actionItems ?? [];
}

export type ClassifiedRequest = {
  kind: "question" | "bug" | "feature";
  title: string;
  detail: string;
};

const FEATURE_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["question", "bug", "feature"] },
    title: { type: "string" },
    detail: { type: "string" },
  },
  required: ["kind", "title", "detail"],
} as const;

// Turn a raw in-meeting note about the tool itself into a crisp backlog entry:
// classify it (question/bug/feature) and rewrite a short title + detail.
export async function classifyFeatureRequest(
  meetingId: string,
  rawText: string
): Promise<ClassifiedRequest> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    output_config: {
      format: { type: "json_schema", schema: FEATURE_REQUEST_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          "A participant in a live software meeting submitted the note below about the meeting tool ITSELF — a feature idea, a bug report, or a question about how it works.",
          "Classify it and rewrite it as a concise product backlog entry.",
          '- kind: "bug" if something is broken or wrong, "feature" if it is a new capability or improvement, "question" if it asks how the tool works.',
          "- title: one short imperative line (max ~10 words).",
          "- detail: 1-2 sentences expanding on it, preserving the author's intent. Empty string if the title already says everything.",
          "",
          `NOTE: ${rawText}`,
        ].join("\n"),
      },
    ],
  });

  await recordUsage(meetingId, "feedback", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(text) as Partial<ClassifiedRequest>;
  return {
    kind: parsed.kind ?? "feature",
    title: parsed.title?.trim() || rawText.slice(0, 80),
    detail: parsed.detail?.trim() ?? "",
  };
}

// Synthesize a SHORT, code-grounded technical brief for the coding agent, using
// the action items plus the most relevant retrieved code. Concise and specific.
export async function synthesizeSpec(
  meetingId: string,
  args: {
    title: string;
    actionItems: { title: string; description: string }[];
    relevantCode: { path: string; content: string }[];
  }
): Promise<string> {
  const items = args.actionItems
    .map((a, i) => `${i + 1}. ${a.title}: ${a.description}`)
    .join("\n");
  const code = args.relevantCode
    .map((c) => `--- ${c.path} ---\n${c.content.slice(0, 1500)}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: [
          `Meeting: "${args.title}". Write a SHORT, specific technical brief for a coding agent that has this repository checked out.`,
          "Base it on the action items and the retrieved relevant code below.",
          "Reference the ACTUAL files and symbols from the retrieved code. Say exactly what to change or add and where. If it's a new feature, place it where the existing structure implies.",
          "Be compact: a few tight bullet points or short paragraphs. No preamble, no restating the codebase, no filler.",
          "",
          "=== ACTION ITEMS ===",
          items,
          "",
          "=== RELEVANT CODE (retrieved by similarity) ===",
          code || "(none retrieved)",
        ].join("\n"),
      },
    ],
  });

  await recordUsage(meetingId, "spec", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Describe a screen-share frame for meeting context. Concise on purpose —
// these get stored as context items the AI later reasons over.
export async function describeScreen(
  meetingId: string,
  base64: string,
  mediaType: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
              data: base64,
            },
          },
          {
            type: "text",
            text: "This is a screen shared during a software meeting. In 1-3 sentences, describe what is on screen for meeting context — the app or site, key content, any visible code, errors, data, or UI being discussed. Respond with only the description.",
          },
        ],
      },
    ],
  });

  await recordUsage(meetingId, "vision", MODEL, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
