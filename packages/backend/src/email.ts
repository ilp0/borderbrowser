/**
 * Transactional email via Resend. The only message we send is "here's your
 * BorderBrowser API key" / "your top-up is ready" — keep it short and clear.
 */

export type EmailEnv = {
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  HOMEPAGE_URL: string;
};

export async function sendNewKeyEmail(
  env: EmailEnv,
  args: { to: string; apiKey: string; credits: number; baseUrl: string },
): Promise<void> {
  const subject = "Your BorderBrowser API key";
  const dollars = (args.credits / 1_000_000).toFixed(2);
  const text = `Welcome to BorderBrowser.

Your API key:
  ${args.apiKey}

Starting balance: $${dollars} (in upstream LLM credit, with margin already baked in).

Paste it into the BorderBrowser extension under Settings → API key. Use this
base URL:

  ${args.baseUrl}

When the balance runs low, top up at:
  ${env.HOMEPAGE_URL}/topup

Keep this key safe. We never store the raw key on our side, so we can't recover
it for you if you lose it.
`;
  await sendViaResend(env, { to: args.to, subject, text });
}

export async function sendTopUpEmail(
  env: EmailEnv,
  args: { to: string; keyPrefix: string; addedCredits: number; newBalance: number },
): Promise<void> {
  const added = (args.addedCredits / 1_000_000).toFixed(2);
  const balance = (args.newBalance / 1_000_000).toFixed(2);
  const subject = `BorderBrowser top-up: $${added}`;
  const text = `Your top-up is in.

  Key:        ${args.keyPrefix}…
  Added:      $${added}
  New balance: $${balance}

Thanks for using BorderBrowser.
`;
  await sendViaResend(env, { to: args.to, subject, text });
}

async function sendViaResend(
  env: EmailEnv,
  args: { to: string; subject: string; text: string },
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      text: args.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}
