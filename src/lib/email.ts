import "server-only";

// Default sender uses the Resend-verified domain (m.seedlabs.tech).
const FROM = process.env.EMAIL_FROM || "Seedlabs Meetings <noreply@m.seedlabs.tech>";

// Send a magic-link sign-in email. In production with RESEND_API_KEY set, sends
// via Resend; otherwise logs the link to the server console (dev-friendly).
export async function sendMagicLink(email: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[auth] Magic link for ${email}: ${url}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: email,
      subject: "Sign in to Meeting Intelligence",
      html: `<p>Click to sign in:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
