import Anthropic from "@anthropic-ai/sdk";

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
  bundle: MeetingContextBundle
): Promise<GeneratedActionItem[]> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: ACTION_ITEMS_SCHEMA } },
    messages: [{ role: "user", content: buildPrompt(bundle) }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(text) as { actionItems: GeneratedActionItem[] };
  return parsed.actionItems ?? [];
}
