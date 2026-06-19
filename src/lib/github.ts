import { Octokit } from "@octokit/rest";

export type RepoContext = {
  owner: string;
  repo: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  readme: string | null;
  tree: string[]; // sampled file paths
};

// Parse "owner/repo", a full github.com URL, or a .git clone URL.
export function parseRepoUrl(
  input: string
): { owner: string; repo: string } | null {
  const cleaned = input.trim().replace(/\.git$/, "");
  const urlMatch = cleaned.match(
    /github\.com[/:]([^/]+)\/([^/?#]+)/i
  );
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = cleaned.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  return null;
}

// Fetch lightweight repo context (metadata + README + a sample of the file
// tree) to feed the AI when generating action items.
export async function fetchRepoContext(
  repoUrl: string,
  token?: string
): Promise<RepoContext> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error("Could not parse a GitHub owner/repo from the URL");
  const { owner, repo } = parsed;

  const octokit = new Octokit({ auth: token || process.env.GITHUB_TOKEN });

  const { data: repoData } = await octokit.repos.get({ owner, repo });

  let readme: string | null = null;
  try {
    const { data } = await octokit.repos.getReadme({ owner, repo });
    readme = Buffer.from(data.content, "base64").toString("utf8").slice(0, 8000);
  } catch {
    // README is optional.
  }

  let tree: string[] = [];
  try {
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: repoData.default_branch,
      recursive: "true",
    });
    tree = data.tree
      .filter((n) => n.type === "blob" && n.path)
      .map((n) => n.path as string)
      .slice(0, 200); // keep the prompt bounded
  } catch {
    // Tree may be unavailable on empty repos.
  }

  return {
    owner,
    repo,
    description: repoData.description,
    defaultBranch: repoData.default_branch,
    language: repoData.language,
    topics: repoData.topics ?? [],
    readme,
    tree,
  };
}

// Compact, prompt-friendly text rendering of the repo context.
export function renderRepoContext(ctx: RepoContext): string {
  const lines = [
    `GitHub repo: ${ctx.owner}/${ctx.repo}`,
    ctx.description ? `Description: ${ctx.description}` : null,
    `Primary language: ${ctx.language ?? "unknown"}`,
    `Default branch: ${ctx.defaultBranch}`,
    ctx.topics.length ? `Topics: ${ctx.topics.join(", ")}` : null,
    "",
    "File tree (sampled):",
    ctx.tree.map((p) => `  ${p}`).join("\n") || "  (empty)",
  ].filter(Boolean);
  if (ctx.readme) {
    lines.push("", "README (truncated):", ctx.readme);
  }
  return lines.join("\n");
}
