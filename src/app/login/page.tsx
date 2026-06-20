"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { GitBranch, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const initialError = params.get("error")
    ? "Sign-in failed or the link expired. Try again."
    : null;

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "github" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [sent, setSent] = useState(false);

  async function emailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    try {
      const res = await signIn("resend", { email, redirect: false });
      if (res?.error) throw new Error("Could not send the sign-in link");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading">Sign in</CardTitle>
          <CardDescription>
            Use a magic link or your GitHub account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="flex items-center gap-2 text-sm text-secondary">
              <Mail className="size-4" /> Check your email for the sign-in link.
            </p>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={busy !== null}
                onClick={() => {
                  setBusy("github");
                  signIn("github", { redirectTo: "/" });
                }}
              >
                {busy === "github" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GitBranch className="size-4" />
                )}
                Continue with GitHub
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={emailSignIn} className="space-y-3">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <Button type="submit" disabled={busy !== null} className="w-full gap-2">
                  {busy === "email" && <Loader2 className="size-4 animate-spin" />}
                  {busy === "email" ? "Sending…" : "Send magic link"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
