import crypto from "crypto";
import { createAppAuth } from "@octokit/auth-app";

const APP_ID = process.env.GITHUB_APP_ID;
const APP_SLUG = process.env.GITHUB_APP_SLUG;

// Accept the private key as a raw PEM, a PEM with escaped "\n", or base64.
function getPrivateKey(): string | undefined {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!raw) return undefined;
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return raw;
  }
}

export function isGithubAppConfigured(): boolean {
  return Boolean(APP_ID && APP_SLUG && getPrivateKey());
}

// State binds the install redirect to a meeting and is HMAC-signed (keyed by the
// app private key) so a returned installation can't be forged onto another room.
function stateSecret(): string {
  return getPrivateKey() ?? "unconfigured";
}

export function signState(meetingId: string): string {
  const mac = crypto
    .createHmac("sha256", stateSecret())
    .update(meetingId)
    .digest("base64url");
  return `${meetingId}.${mac}`;
}

export function verifyState(state: string): string | null {
  const dot = state.lastIndexOf(".");
  if (dot < 1) return null;
  const meetingId = state.slice(0, dot);
  const mac = state.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(meetingId)
    .digest("base64url");
  if (mac.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    ? meetingId
    : null;
}

// Normalize the slug in case GITHUB_APP_SLUG was set to the full app URL
// (e.g. "https://github.com/apps/my-app") rather than just "my-app".
function appSlug(): string {
  return (APP_SLUG ?? "")
    .replace(/^https?:\/\/github\.com\/apps\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

// GitHub's "install this app" page; on completion GitHub redirects to the app's
// configured Setup URL with installation_id + our state.
export function getInstallUrl(meetingId: string): string {
  return `https://github.com/apps/${appSlug()}/installations/new?state=${encodeURIComponent(
    signState(meetingId)
  )}`;
}

// Mint a short-lived installation access token, optionally scoped to one repo.
export async function mintInstallationToken(
  installationId: string,
  repoName?: string
): Promise<string> {
  const privateKey = getPrivateKey();
  if (!APP_ID || !privateKey) throw new Error("GitHub App is not configured");
  const auth = createAppAuth({ appId: APP_ID, privateKey });
  const { token } = await auth({
    type: "installation",
    installationId: Number(installationId),
    repositoryNames: repoName ? [repoName] : undefined,
  });
  return token;
}
