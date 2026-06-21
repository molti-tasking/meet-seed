import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One-time setup for the coding-agent feature. Creates the persistent Managed
 * Agents resources (environment, agent, and — only if a PAT is provided — a
 * fallback vault) and prints the ids to put in your environment. Re-running
 * creates NEW resources — run once and keep the ids.
 *
 *   # With the GitHub App (recommended): no PAT needed.
 *   ANTHROPIC_API_KEY=sk-ant-... npm run setup:agent
 *
 *   # Or to also create a global fallback vault for non-App repos:
 *   GITHUB_PAT=github_pat_... ANTHROPIC_API_KEY=sk-ant-... npm run setup:agent
 */

const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";

async function main() {
  const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

  const client = new Anthropic();

  console.log("Creating environment…");
  const environment = await client.beta.environments.create({
    name: `meeting-coding-agent-${Date.now()}`,
    config: { type: "cloud", networking: { type: "unrestricted" } },
  });

  console.log("Creating agent…");
  const agent = await client.beta.agents.create({
    name: "Meeting Coding Agent",
    model: "claude-opus-4-8",
    system: [
      "You are a senior software engineer. You receive technical action items",
      "from a meeting and a checked-out GitHub repository in your workspace.",
      "Work autonomously, but first determine the correct BASE branch: if the repo",
      "has a single main branch use it; if there are multiple long-lived branches or",
      "it is ambiguous which to target, STOP and ask rather than guessing. Then",
      "implement the action items on a NEW branch off that base, keep changes minimal",
      "and focused on exactly what was asked, run any available build or tests to",
      "verify, commit, push the branch, and open a pull request using the GitHub",
      "tools. NEVER merge — a human reviews.",
      "Only stop to ask if you are genuinely blocked or need a decision you cannot",
      "reasonably make on your own; when you ask, pose ONE concise question and end",
      "your turn — a human will reply and you continue. The human may also send you",
      "extra context mid-run; incorporate it. When finished, end your final message",
      "with exactly one line: 'PR_URL: <url>' on success, or 'PR_ERROR: <reason>'.",
    ].join(" "),
    tools: [
      { type: "agent_toolset_20260401" },
      { type: "mcp_toolset", mcp_server_name: "github" },
    ],
    mcp_servers: [{ type: "url", name: "github", url: GITHUB_MCP_URL }],
  });

  // The vault is only the fallback for repos connected WITHOUT the GitHub App.
  // With the App, each run uses a short-lived installation token in its own
  // ephemeral vault — so a PAT/global vault isn't needed at all.
  let vaultId: string | undefined;
  if (githubPat) {
    console.log("Creating fallback vault + GitHub MCP credential…");
    const vault = await client.beta.vaults.create({ display_name: "github-mcp" });
    await client.beta.vaults.credentials.create(vault.id, {
      display_name: "GitHub MCP (PAT)",
      auth: { type: "static_bearer", mcp_server_url: GITHUB_MCP_URL, token: githubPat },
    });
    vaultId = vault.id;
  }

  console.log("\n✅ Setup complete. Add these to your environment:\n");
  console.log(`AGENT_ID=${agent.id}`);
  console.log(`ENVIRONMENT_ID=${environment.id}`);
  if (vaultId) {
    console.log(`VAULT_ID=${vaultId}`);
    console.log("\n(VAULT_ID + GITHUB_PAT are the fallback for non-App repos.)");
  } else {
    console.log(
      "\nNo PAT provided — no fallback vault created. The GitHub App provides" +
        " per-meeting auth at runtime (recommended). You do NOT need VAULT_ID/GITHUB_PAT."
    );
  }
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
