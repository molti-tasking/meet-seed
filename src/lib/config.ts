// Which integrations are configured (presence of env vars — never the values).
// Used by the boot-time log and the /api/health endpoint to make missing config
// obvious instead of surfacing as runtime errors.
export function integrationStatus(): Record<string, boolean> {
  const env = process.env;
  return {
    database: !!env.DATABASE_URL,
    appUrl: !!env.APP_URL,
    auth: !!env.AUTH_SECRET,
    githubOAuth: !!(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET),
    email: !!env.RESEND_API_KEY,
    livekit: !!(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.NEXT_PUBLIC_LIVEKIT_URL),
    deepgram: !!env.DEEPGRAM_API_KEY,
    anthropic: !!env.ANTHROPIC_API_KEY,
    voyage: !!env.VOYAGE_API_KEY,
    githubApp: !!(env.GITHUB_APP_ID && env.GITHUB_APP_SLUG && env.GITHUB_APP_PRIVATE_KEY),
    codingAgent: !!(
      env.AGENT_ID &&
      env.ENVIRONMENT_ID &&
      (env.GITHUB_PAT || (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY))
    ),
  };
}
