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

// Build the task brief the agent receives. The action items are the spec; the
// final-line contract (PR_URL/PR_ERROR) is how we read the result back out.
function buildBrief(args: {
  meetingTitle: string;
  repoUrl: string;
  branch: string;
  actionItems: ActionItemBrief[];
}): string {
  const items = args.actionItems
    .map((a, i) => {
      const refs = a.fileRefs.length ? `\n   files: ${a.fileRefs.join(", ")}` : "";
      return `${i + 1}. [${a.priority}] ${a.title}\n   ${a.description}${refs}`;
    })
    .join("\n\n");

  return [
    `These technical action items came out of the meeting "${args.meetingTitle}".`,
    `The repository is checked out in your workspace (cloned from ${args.repoUrl}).`,
    "",
    "Implement the action items:",
    items,
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

export type CodingSessionResult = {
  status: "running" | "needs_review" | "failed";
  prUrl?: string;
  prNumber?: number;
  error?: string;
};

// Concatenate the text of every agent message emitted so far.
async function collectAgentText(sessionId: string): Promise<string> {
  let text = "";
  for await (const event of anthropic.beta.sessions.events.list(sessionId)) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") text += block.text + "\n";
      }
    }
  }
  return text;
}

// Poll a session: map its lifecycle status onto our row status and, once the
// agent has reported a result, extract the PR URL (or the error).
export async function getSessionResult(
  sessionId: string
): Promise<CodingSessionResult> {
  const session = await anthropic.beta.sessions.retrieve(sessionId);

  // Still working — keep polling.
  if (session.status === "running" || session.status === "rescheduling") {
    return { status: "running" };
  }

  const text = await collectAgentText(sessionId);
  const urlMatch = text.match(/PR_URL:\s*(\S+)/);
  if (urlMatch) {
    const prUrl = urlMatch[1];
    const numMatch = prUrl.match(/\/pull\/(\d+)/);
    return {
      status: "needs_review",
      prUrl,
      prNumber: numMatch ? Number(numMatch[1]) : undefined,
    };
  }

  const errMatch = text.match(/PR_ERROR:\s*(.+)/);
  return {
    status: "failed",
    error: errMatch ? errMatch[1].trim() : "Agent finished without opening a PR.",
  };
}
