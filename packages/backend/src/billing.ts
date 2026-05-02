/**
 * Stripe billing routes.
 *
 *   POST /buy     — body: { email, amountUsdCents }       → returns { url } (Stripe Checkout)
 *   POST /topup   — body: { apiKey, amountUsdCents }      → returns { url }
 *   POST /webhook — Stripe webhook: mints/credits keys, sends email
 *
 * The webhook is the only piece that mutates state. /buy and /topup just
 * create Checkout sessions with metadata so the webhook knows what to do.
 */

import { Hono } from "hono";
import Stripe from "stripe";
import {
  addCredits,
  db,
  findKeyByEmail,
  findKeyByHash,
  insertApiKey,
  popAnonKey,
  recordTopUp,
  stashAnonKey,
  topUpAlreadyApplied,
} from "./db.ts";
import { sendNewKeyEmail, sendTopUpEmail } from "./email.ts";
import { generateApiKey, hashKey, isWellFormed, keyPrefix } from "./keys.ts";
import { usdCentsToMicros } from "./pricing.ts";
import type { Env } from "./types.ts";

export const billing = new Hono<{ Bindings: Env }>();

const ALLOWED_AMOUNTS_CENTS = new Set([500, 1000, 2500, 5000, 10000]);

export type BuyInput = {
  email?: string;
  amountUsdCents?: number;
  anonymous?: boolean;
};
export type BuyValidation =
  | { ok: true; isAnon: boolean; email: string | null; amountUsdCents: number }
  | { ok: false; error: "invalid_email" | "invalid_amount" };

/**
 * Pure validator for /buy — exported so tests can hit it without mocking
 * Stripe. `anonymous: true` short-circuits the email check.
 */
export function validateBuy(input: BuyInput): BuyValidation {
  const isAnon = input.anonymous === true;
  if (!isAnon && (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) {
    return { ok: false, error: "invalid_email" };
  }
  if (!input.amountUsdCents || !ALLOWED_AMOUNTS_CENTS.has(input.amountUsdCents)) {
    return { ok: false, error: "invalid_amount" };
  }
  return {
    ok: true,
    isAnon,
    email: isAnon ? null : input.email!,
    amountUsdCents: input.amountUsdCents,
  };
}

billing.post("/buy", async (c) => {
  // Anonymous flow: pay without giving us an email. No receipt is sent (Stripe
  // shows a "no email on file" Checkout flow), and the key is delivered via
  // the success page using {CHECKOUT_SESSION_ID}.
  const v = validateBuy(await c.req.json<BuyInput>());
  if (!v.ok) return c.json({ error: v.error }, 400);
  const { isAnon, email, amountUsdCents } = v;

  const stripe = stripeClient(c.env);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    // Anonymous: leave customer_email undefined — Stripe will not auto-send a
    // receipt and we won't know who paid. By design.
    ...(email ? { customer_email: email } : {}),
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountUsdCents,
          product_data: {
            name: `BorderBrowser API key — $${(amountUsdCents / 100).toFixed(0)} credit`,
          },
        },
        quantity: 1,
      },
    ],
    // Anonymous flow appends &session_id={CHECKOUT_SESSION_ID} so the success
    // page can fetch the minted key from /v1/anon-key.
    success_url: isAnon
      ? `${c.env.HOMEPAGE_URL}/buy?status=success&anon=1&session_id={CHECKOUT_SESSION_ID}`
      : `${c.env.HOMEPAGE_URL}/buy?status=success`,
    cancel_url: `${c.env.HOMEPAGE_URL}/buy?status=cancel`,
    metadata: {
      flow: "new_key",
      amount_usd_cents: String(amountUsdCents),
      ...(isAnon ? { anonymous: "1" } : { email: email! }),
    },
  });

  return c.json({ url: session.url });
});

/**
 * Anonymous-flow key retrieval. The success page hits this once with the
 * Stripe session id; we return the raw key and delete the row so it can't be
 * fetched again. Single-shot by design — there's no email to fall back on.
 */
billing.get("/v1/anon-key", async (c) => {
  const sessionId = c.req.query("session_id");
  if (!sessionId) return c.json({ error: "missing_session_id" }, 400);
  const sql = db(c.env.DATABASE_URL);
  const apiKey = await popAnonKey(sql, sessionId);
  if (!apiKey) return c.json({ error: "not_ready_or_already_retrieved" }, 404);
  return c.json({ apiKey });
});

billing.post("/topup", async (c) => {
  const { apiKey, amountUsdCents } = await c.req.json<{
    apiKey?: string;
    amountUsdCents?: number;
  }>();

  if (!apiKey || !isWellFormed(apiKey)) {
    return c.json({ error: "invalid_key" }, 400);
  }
  if (!amountUsdCents || !ALLOWED_AMOUNTS_CENTS.has(amountUsdCents)) {
    return c.json({ error: "invalid_amount" }, 400);
  }

  const sql = db(c.env.DATABASE_URL);
  const row = await findKeyByHash(sql, await hashKey(apiKey));
  if (!row) return c.json({ error: "key_not_found" }, 404);
  if (row.revoked) return c.json({ error: "key_revoked" }, 403);

  const stripe = stripeClient(c.env);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    // For anonymous keys (email = null), Stripe gets no customer_email; user
    // continues unidentified.
    ...(row.email ? { customer_email: row.email } : {}),
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountUsdCents,
          product_data: {
            name: `BorderBrowser top-up — $${(amountUsdCents / 100).toFixed(0)} credit`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${c.env.HOMEPAGE_URL}/topup?status=success`,
    cancel_url: `${c.env.HOMEPAGE_URL}/topup?status=cancel`,
    metadata: {
      flow: "topup",
      api_key_id: String(row.id),
      amount_usd_cents: String(amountUsdCents),
    },
  });

  return c.json({ url: session.url });
});

billing.post("/webhook", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.text("missing signature", 400);

  const stripe = stripeClient(c.env);
  const raw = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    return c.text(`signature verification failed: ${err}`, 400);
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge so Stripe stops retrying.
    return c.text("ok", 200);
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const flow = session.metadata?.flow;
  const sql = db(c.env.DATABASE_URL);

  if (flow === "new_key") {
    if (await topUpAlreadyApplied(sql, session.id)) return c.text("ok", 200);

    const isAnon = session.metadata?.anonymous === "1";
    const email = isAnon
      ? null
      : (session.metadata?.email ?? session.customer_email ?? "");
    const amountCents = Number(session.metadata?.amount_usd_cents ?? 0);
    if ((!isAnon && !email) || !amountCents) return c.text("bad metadata", 400);

    const apiKey = generateApiKey();
    const credits = usdCentsToMicros(amountCents);

    const apiKeyId = await insertApiKey(sql, {
      keyHash: await hashKey(apiKey),
      keyPrefix: keyPrefix(apiKey),
      email,
    });
    await addCredits(sql, { apiKeyId, creditsToAdd: credits });
    await recordTopUp(sql, {
      apiKeyId,
      stripeSessionId: session.id,
      stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      amountUsdCents: amountCents,
      creditsAdded: credits,
    });

    if (isAnon) {
      // No email to send to — stash the raw key for one-shot pickup.
      await stashAnonKey(sql, { stripeSessionId: session.id, apiKey });
    } else {
      await sendNewKeyEmail(c.env, {
        to: email!,
        apiKey,
        credits,
        baseUrl: c.env.PUBLIC_BASE_URL + "/v1",
      });
    }
    return c.text("ok", 200);
  }

  if (flow === "topup") {
    if (await topUpAlreadyApplied(sql, session.id)) return c.text("ok", 200);

    const apiKeyId = Number(session.metadata?.api_key_id ?? 0);
    const amountCents = Number(session.metadata?.amount_usd_cents ?? 0);
    if (!apiKeyId || !amountCents) return c.text("bad metadata", 400);

    const credits = usdCentsToMicros(amountCents);
    await addCredits(sql, { apiKeyId, creditsToAdd: credits });
    await recordTopUp(sql, {
      apiKeyId,
      stripeSessionId: session.id,
      stripePaymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      amountUsdCents: amountCents,
      creditsAdded: credits,
    });

    // Look up email + new balance for the receipt. Anonymous keys have no
    // email; we silently skip the receipt for them.
    const row = (await sql`
      SELECT email, key_prefix, credits_remaining
      FROM api_keys WHERE id = ${apiKeyId}
    `) as { email: string | null; key_prefix: string; credits_remaining: number }[];
    const r = row[0];
    if (r && r.email) {
      await sendTopUpEmail(c.env, {
        to: r.email,
        keyPrefix: r.key_prefix,
        addedCredits: credits,
        newBalance: r.credits_remaining,
      });
    }
    return c.text("ok", 200);
  }

  return c.text("ok", 200);
});

function stripeClient(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// Silence unused-import warning for findKeyByEmail (kept for /lookup if added later).
void findKeyByEmail;
