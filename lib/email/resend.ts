// Resend transactional email via the REST API over fetch — no Node SDK, so it
// bundles cleanly into the Worker.

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(env: CloudflareEnv, args: SendArgs): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM || "onboarding@resend.dev";
  if (!apiKey) {
    console.warn(`[resend] RESEND_API_KEY not set — skipping email to ${args.to}`);
    return;
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}
