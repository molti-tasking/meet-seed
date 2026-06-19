import Link from "next/link";

export const metadata = {
  title: "Connecting a GitHub repository — Meeting Intelligence",
};

export default function GithubHelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-200">
      <Link href="/" className="text-xs text-sky-400 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-neutral-100">
        Connecting a GitHub repository
      </h1>
      <p className="mt-2 text-neutral-400">
        Connecting a repo to a meeting lets its coding agent implement the
        meeting&apos;s action items and open a pull request for you to review and
        merge — without ever handing it a long-lived token.
      </p>

      <Section title="In a meeting">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open the <strong>Context</strong> tab in the meeting room.
          </li>
          <li>
            Paste the repository (e.g. <Code>owner/repo</Code>) in the{" "}
            <strong>GitHub repository</strong> field and click{" "}
            <strong>Connect repo</strong>. This pulls in repo context (tree +
            README) for the AI.
          </li>
          <li>
            Click <strong>Connect GitHub App</strong>. You&apos;ll be sent to
            GitHub to install the app on that repository, then returned to the
            meeting — the section now shows <strong>✓ Connected</strong>.
          </li>
          <li>
            Generate <strong>action items</strong>, then under{" "}
            <strong>Merge requests</strong> click{" "}
            <strong>Create from action items</strong>. The agent works in the
            background; the panel updates to <em>PR ready for review</em> with a
            link when it&apos;s done.
          </li>
          <li>
            Review the pull request on GitHub. When you&apos;re happy, click{" "}
            <strong>Merge</strong> (in the meeting or afterwards).
          </li>
        </ol>
      </Section>

      <Section title="What access it needs">
        <p className="text-sm text-neutral-300">
          The GitHub App requests <strong>Contents: write</strong> (to push a
          branch), <strong>Pull requests: write</strong> (to open the PR), and{" "}
          <strong>Metadata: read</strong>. Each agent run uses a{" "}
          <strong>short-lived token scoped to just that repository</strong>; it
          expires automatically and is never stored. The agent always opens a{" "}
          <strong>pull request</strong> — it never pushes to your default branch
          or merges on its own.
        </p>
      </Section>

      <Section title="One-time admin setup">
        <p className="text-sm text-neutral-300">
          Connecting a repo only works once an operator has wired up the GitHub
          App. This is done once for the whole deployment:
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Register a <strong>GitHub App</strong> with the permissions above and
            set its <strong>Setup URL</strong> to{" "}
            <Code>https://&lt;your-domain&gt;/api/github/app/callback</Code>{" "}
            (enable &ldquo;Redirect on update&rdquo;).
          </li>
          <li>
            Set <Code>GITHUB_APP_ID</Code>, <Code>GITHUB_APP_SLUG</Code>, and{" "}
            <Code>GITHUB_APP_PRIVATE_KEY</Code> in the environment.
          </li>
          <li>
            Run <Code>npm run setup:agent</Code> once and set the printed{" "}
            <Code>AGENT_ID</Code> / <Code>ENVIRONMENT_ID</Code>.
          </li>
          <li>
            Ensure the <strong>Managed Agents</strong> beta is enabled on the
            Anthropic account.
          </li>
        </ol>
        <p className="mt-2 text-xs text-neutral-500">
          Full deployment details live in <Code>DEPLOY.md</Code> in the
          repository. As a fallback, a global <Code>GITHUB_PAT</Code> +{" "}
          <Code>VAULT_ID</Code> lets all rooms share one token instead of using
          the App.
        </p>
      </Section>

      <Section title="Troubleshooting">
        <ul className="space-y-2 text-sm text-neutral-300">
          <li>
            <strong>&ldquo;Connect GitHub App&rdquo; returns an error</strong> —
            the GitHub App env vars aren&apos;t set; ask your operator to finish
            the one-time setup above.
          </li>
          <li>
            <strong>&ldquo;Coding agent is not configured&rdquo;</strong> —{" "}
            <Code>AGENT_ID</Code>/<Code>ENVIRONMENT_ID</Code> are missing, or no
            GitHub auth (App or PAT) is set.
          </li>
          <li>
            <strong>&ldquo;This meeting has no connected GitHub
            repository&rdquo;</strong> — add the repo URL in the Context tab
            first.
          </li>
          <li>
            <strong>&ldquo;Invalid state&rdquo; after installing</strong> — the
            install link expired or was tampered with; start again from{" "}
            <strong>Connect GitHub App</strong> inside the meeting.
          </li>
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[12px] text-sky-300">
      {children}
    </code>
  );
}
