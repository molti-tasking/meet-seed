import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Connecting a GitHub repository — Meeting Intelligence",
};

export default function GithubHelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="font-heading mt-3 text-3xl font-bold tracking-tight">
        Connecting a GitHub repository
      </h1>
      <p className="mt-2 text-muted-foreground">
        Connecting a repo to a meeting lets its coding agent implement the
        meeting&apos;s action items and open a pull request for you to review and
        merge — without ever handing it a long-lived token.
      </p>

      <div className="mt-8 space-y-4">
        <Section title="In a meeting">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-card-foreground">
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
              Click <strong>Connect GitHub App</strong>. A popup opens to install
              the app on that repository; when it closes the section shows{" "}
              <strong>✓ Connected</strong> — your meeting tab never navigates away.
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
          <p className="text-sm text-card-foreground">
            The GitHub App requests <strong>Contents: write</strong> (push a
            branch), <strong>Pull requests: write</strong> (open the PR), and{" "}
            <strong>Metadata: read</strong>. Each agent run uses a{" "}
            <strong>short-lived token scoped to just that repository</strong>; it
            expires automatically and is never stored. The agent always opens a{" "}
            <strong>pull request</strong> — it never pushes to your default branch
            or merges on its own.
          </p>
        </Section>

        <Section title="One-time admin setup">
          <p className="text-sm text-card-foreground">
            Connecting a repo only works once an operator has wired up the GitHub
            App (once per deployment):
          </p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-card-foreground">
            <li>
              Register a <strong>GitHub App</strong> (Contents + Pull requests:
              write, Metadata: read) with its <strong>Setup URL</strong> set to{" "}
              <Code>https://&lt;your-domain&gt;/api/github/app/callback</Code> and
              &ldquo;Redirect on update&rdquo; enabled.
            </li>
            <li>
              Set <Code>GITHUB_APP_ID</Code>, <Code>GITHUB_APP_SLUG</Code> (just the
              slug, e.g. <Code>seedlabs-meeting-agent</Code> — not the full URL), and{" "}
              <Code>GITHUB_APP_PRIVATE_KEY</Code>.
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
          <p className="mt-2 text-xs text-muted-foreground">
            Full deployment details live in <Code>DEPLOY.md</Code>. As a fallback, a
            global <Code>GITHUB_PAT</Code> + <Code>VAULT_ID</Code> lets all rooms
            share one token instead of the App.
          </p>
        </Section>

        <Section title="Troubleshooting">
          <ul className="space-y-2 text-sm text-card-foreground">
            <li>
              <strong>The install page 404s with a doubled URL</strong> —{" "}
              <Code>GITHUB_APP_SLUG</Code> was set to the full URL; use just the
              slug (<Code>seedlabs-meeting-agent</Code>).
            </li>
            <li>
              <strong>&ldquo;Connect GitHub App&rdquo; errors</strong> — the App env
              vars aren&apos;t set; finish the one-time setup above.
            </li>
            <li>
              <strong>&ldquo;Coding agent is not configured&rdquo;</strong> —{" "}
              <Code>AGENT_ID</Code>/<Code>ENVIRONMENT_ID</Code> are missing, or no
              GitHub auth (App or PAT) is set.
            </li>
            <li>
              <strong>&ldquo;Invalid state&rdquo; after installing</strong> — the
              install link expired; start again from <strong>Connect GitHub App</strong>.
            </li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}
