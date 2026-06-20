// Runs once on server startup (Next.js instrumentation hook). Logs which
// integrations are configured so missing env vars are obvious in the logs.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { log } = await import("@/lib/logger");
    const { integrationStatus } = await import("@/lib/config");
    const status = integrationStatus();
    log.info("startup: integration config", status);
    const missing = Object.entries(status)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (missing.length) log.warn("startup: integrations not configured", { missing });
  }
}
