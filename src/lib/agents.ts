import Anthropic from "@anthropic-ai/sdk";
import { parseRepoUrl } from "@/lib/github";
import { isGithubAppConfigured, mintInstallationToken } from "@/lib/githubApp";

// Shared client; reads ANTHROPIC_API_KEY from the environment.
const anthropic = new Anthropic();

const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";

// AGENT_ID + ENVIRONMENT_ID are created once by `scripts/setup-agent.ts`.
const AGENT_ID = process.env.AGENT_ID;
const ENVIRONMENT_ID = process.env.ENVIRONMENT_ID;
// Global-PAT fallback (used when a meeting has no GitHub App installation).
const VAULT_ID = process.env.VAULT_ID;
const GITHUB_PAT = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;

// The agent + environment must exist, and we need at least one auth path:
// a GitHub App (per-meeting installs) or the global PAT + vault.
export function isCodingAgentConfigured(): boolean {
  const hasAuth = isGithubAppConfigured() || Boolean(VAULT_ID && GITHUB_PAT);
  return Boolean(AGENT_ID && ENVIRONMENT_ID && hasAuth);
}

export type ActionItemBrief = {
  title: string;
  description: string;
  fileRefs: string[];
  priority: string;
};

// Build the task brief the agent receives. When a synthesized, code-grounded
// spec is available it's the task; otherwise the raw action items are. The
// final-line contract (PR_URL/PR_ERROR) is how we read the result back out.
function buildBrief(args: {
  meetingTitle: string;
  repoUrl: string;
  branch: string;
  actionItems: ActionItemBrief[];
  spec?: string;
}): string {
  const task =
    args.spec ??
    args.actionItems
      .map((a, i) => {
        const refs = a.fileRefs.length ? `\n   files: ${a.fileRefs.join(", ")}` : "";
        return `${i + 1}. [${a.priority}] ${a.title}\n   ${a.description}${refs}`;
      })
      .join("\n\n");

  return [
    `This task came out of the meeting "${args.meetingTitle}".`,
    `The repository is checked out in your workspace (cloned from ${args.repoUrl}).`,
    "",
    "Implement the following:",
    task,
    "",
    `Work on a NEW branch named "${args.branch}" off the default branch. Keep the`,
    "changes minimal and focused on what was asked. Run any available build/tests",
    "to verify. Commit, push the branch, and open a pull request with the GitHub",
    "tools. Do NOT merge it — a human reviews and merges.",
    "",
    "When finished, end your final message with exactly one of these lines:",
    "  PR_URL: <the full URL of the pull request you opened>",
    "  PR_ERROR: <a short reason you could not open one>",
  ].join("\n");
}

// Resolve the GitHub auth for a run: a per-meeting App installation token (in a
// fresh ephemeral vault) when the meeting is connected via the App, otherwise
// the global PAT + shared vault.
async function resolveGithubAuth(args: {
  repoUrl: string;
  installationId?: string | null;
}): Promise<{ token: string; vaultId: string; ephemeralVaultId?: string }> {
  if (args.installationId && isGithubAppConfigured()) {
    const repo = parseRepoUrl(args.repoUrl)?.repo;
    const token = await mintInstallationToken(args.installationId, repo);
    const vault = await anthropic.beta.vaults.create({
      display_name: `mtg-run-${Math.random().toString(36).slice(2, 8)}`,
    });
    await anthropic.beta.vaults.credentials.create(vault.id, {
      display_name: "GitHub MCP (installation token)",
      auth: { type: "static_bearer", mcp_server_url: GITHUB_MCP_URL, token },
    });
    return { token, vaultId: vault.id, ephemeralVaultId: vault.id };
  }
  if (VAULT_ID && GITHUB_PAT) {
    return { token: GITHUB_PAT, vaultId: VAULT_ID };
  }
  throw new Error("No GitHub auth available for this meeting (connect the GitHub App or set GITHUB_PAT + VAULT_ID)");
}

// Kick off a coding session. Returns the session id and (if created) the
// ephemeral vault id so the caller can archive it when the run finishes.
export async function startCodingSession(args: {
  meetingTitle: string;
  repoUrl: string;
  branch: string;
  actionItems: ActionItemBrief[];
  installationId?: string | null;
  spec?: string;
}): Promise<{ sessionId: string; vaultId?: string }> {
  const auth = await resolveGithubAuth({
    repoUrl: args.repoUrl,
    installationId: args.installationId,
  });

  const session = await anthropic.beta.sessions.create({
    agent: AGENT_ID!,
    environment_id: ENVIRONMENT_ID!,
    vault_ids: [auth.vaultId],
    title: `Code changes: ${args.meetingTitle}`.slice(0, 200),
    resources: [
      {
        type: "github_repository",
        url: args.repoUrl,
        authorization_token: auth.token,
      },
    ],
  });

  await anthropic.beta.sessions.events.send(session.id, {
    events: [{ type: "user.message", content: [{ type: "text", text: buildBrief(args) }] }],
  });

  return { sessionId: session.id, vaultId: auth.ephemeralVaultId };
}

// Archive an ephemeral per-run vault once the run reaches a terminal state.
export async function archiveVault(vaultId: string): Promise<void> {
  try {
    await anthropic.beta.vaults.archive(vaultId);
  } catch {
    /* best-effort cleanup */
  }
}

// One entry in the agent's live activity thread (for the Agents tab UI).
export type ThreadEntry = {
  id: string;
  kind: "message" | "thinking" | "tool" | "status";
  text: string;
};

export type SessionThread = {
  // running        — actively working
  // needs_input    — idle, asked a question / waiting on the human
  // needs_review   — opened a PR
  // failed         — gave up / terminated without a PR
  status: "running" | "needs_input" | "needs_review" | "failed";
  prUrl?: string;
  prNumber?: number;
  error?: string;
  question?: string;
  entries: ThreadEntry[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
};

// List a session's events, build the activity thread, and derive its lifecycle.
export async function getSessionThread(sessionId: string): Promise<SessionThread> {
  const session = await anthropic.beta.sessions.retrieve(sessionId);
  const usage = {
    inputTokens: session.usage?.input_tokens ?? 0,
    outputTokens: session.usage?.output_tokens ?? 0,
    cacheReadTokens: session.usage?.cache_read_input_tokens ?? 0,
  };

  const entries: ThreadEntry[] = [];
  let allText = "";
  let lastAgentMessage = "";

  for await (const event of anthropic.beta.sessions.events.list(sessionId)) {
    if (event.type === "agent.message") {
      const text = event.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
      if (text.trim()) {
        entries.push({ id: event.id, kind: "message", text });
        allText += text + "\n";
        lastAgentMessage = text;
      }
    } else if (event.type === "agent.thinking") {
      entries.push({ id: event.id, kind: "thinking", text: "Thinking…" });
    } else if (
      event.type === "agent.tool_use" ||
      event.type === "agent.mcp_tool_use"
    ) {
      entries.push({ id: event.id, kind: "tool", text: "Used a tool" });
    }
  }

  const running = session.status === "running" || session.status === "rescheduling";

  const urlMatch = allText.match(/PR_URL:\s*(\S+)/);
  if (urlMatch) {
    const prUrl = urlMatch[1];
    const numMatch = prUrl.match(/\/pull\/(\d+)/);
    return {
      status: "needs_review",
      prUrl,
      prNumber: numMatch ? Number(numMatch[1]) : undefined,
      entries,
      usage,
    };
  }

  if (running) return { status: "running", entries, usage };

  const errMatch = allText.match(/PR_ERROR:\s*(.+)/);
  if (errMatch) {
    return { status: "failed", error: errMatch[1].trim(), entries, usage };
  }

  if (session.status === "terminated") {
    return { status: "failed", error: "The agent session terminated.", entries, usage };
  }

  // Idle without a PR and without an explicit error → the agent is asking for
  // input. Surface its last message as the pending question.
  return {
    status: "needs_input",
    question: lastAgentMessage || "The agent is waiting for input.",
    entries,
    usage,
  };
}

// Send a message into a session — answers a question or steers a running run.
// Managed Agents queues it and processes it in order.
export async function sendToSession(
  sessionId: string,
  message: string
): Promise<void> {
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],
  });
}
