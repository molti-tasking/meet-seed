"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type SessionUser = { email?: string | null; name?: string | null };

export function AuthControl() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (!user) {
    return (
      <Link href="/login">
        <Button size="sm" variant="outline">
          Sign in
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{user.email ?? user.name}</span>
      <Button size="sm" variant="ghost" onClick={() => signOut({ redirectTo: "/" })}>
        Sign out
      </Button>
    </div>
  );
}
