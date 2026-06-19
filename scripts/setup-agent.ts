import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * One-time setup for the coding-agent feature. Creates the persistent Managed
 * Agents resources (environment, agent, vault + GitHub MCP credential) and
 * prints the ids to put in your environment as AGENT_ID / ENVIRONMENT_ID /
 * VAULT_ID. Re-running creates NEW resources — run once and keep the ids.
 *
 *   GITHUB_PAT=ghp_... ANTHROPIC_API_KEY=sk-ant-... npm run setup:agent
 */

const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";

async function main() {
  const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
  if (!githubPat) throw new Error("GITHUB_PAT (or GITHUB_TOKEN) is required");

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
      "Work autonomously: implement the action items on a NEW branch off the",
      "default branch, keep changes minimal and focused on exactly what was asked,",
      "run any available build or tests to verify, commit, push the branch, and",
      "open a pull request using the GitHub tools. NEVER merge — a human reviews.",
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

  console.log("Creating vault + GitHub MCP credential…");
  const vault = await client.beta.vaults.create({ display_name: "github-mcp" });
  await client.beta.vaults.credentials.create(vault.id, {
    display_name: "GitHub MCP (PAT)",
    auth: { type: "static_bearer", mcp_server_url: GITHUB_MCP_URL, token: githubPat },
  });

  console.log("\n✅ Setup complete. Add these to your environment:\n");
  console.log(`AGENT_ID=${agent.id}`);
  console.log(`ENVIRONMENT_ID=${environment.id}`);
  console.log(`VAULT_ID=${vault.id}`);
  console.log("\n(GITHUB_PAT must also be set at runtime — it clones/pushes the repo.)");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
