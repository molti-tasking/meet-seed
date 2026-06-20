import { auth } from "@/auth";

// The signed-in user (or null) for server components and route handlers.
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
