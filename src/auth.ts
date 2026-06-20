import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import { db, schema } from "@/lib/db";
import { sendMagicLink } from "@/lib/email";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // Trust the proxy host (Coolify / Traefik) for callback URL derivation.
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    GitHub,
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "dev",
      from: process.env.EMAIL_FROM ?? "Seedlabs Meetings <noreply@m.seedlabs.tech>",
      // Reuse our sender (Resend in prod, console-log in dev).
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLink(identifier, url);
      },
    }),
  ],
});
