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
  recordTopUp,
  setSubscriptionStatus,
  topUpAlreadyApplied,
  upsertSubscription,
  type SubscriptionStatus,
} from "./db.ts";
import { sendNewKeyEmail, sendTopUpEmail } from "./email.ts";
import { generateApiKey, hashKey, isWellFormed, keyPrefix } from "./keys.ts";
import { usdCentsToMicros } from "./pricing.ts";
import type { Env } from "./types.ts";

export const billing = new Hono<{ Bindings: Env }>();

const ALLOWED_AMOUNTS_CENTS = new Set([500, 1000, 2500, 5000, 10000]);

billing.post("/buy", async (c) => {
  const { email, amountUsdCents } = await c.req.json<{
    email?: string;
    amountUsdCents?: number;
  }>();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "invalid_email" }, 400);
  }
  if (!amountUsdCents || !ALLOWED_AMOUNTS_CENTS.has(amountUsdCents)) {
    return c.json({ error: "invalid_amount" }, 400);
  }

  const stripe = stripeClient(c.env);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
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
    success_url: `${c.env.HOMEPAGE_URL}/buy?status=success`,
    cancel_url: `${c.env.HOMEPAGE_URL}/buy?status=cancel`,
    metadata: {
      flow: "new_key",
      email,
      amount_usd_cents: String(amountUsdCents),
    },
  });

  return c.json({ url: session.url });
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
    customer_email: row.email,
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

billing.post("/subscribe", async (c) => {
  const { apiKey } = await c.req.json<{ apiKey?: string }>();

  if (!apiKey || !isWellFormed(apiKey)) {
    return c.json({ error: "invalid_key" }, 400);
  }

  const sql = db(c.env.DATABASE_URL);
  const row = await findKeyByHash(sql, await hashKey(apiKey));
  if (!row) return c.json({ error: "key_not_found" }, 404);
  if (row.revoked) return c.json({ error: "key_revoked" }, 403);

  const priceId = c.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return c.json({ error: "pro_not_configured" }, 503);
  }

  const stripe = stripeClient(c.env);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: row.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${c.env.HOMEPAGE_URL}/pro?status=success`,
    cancel_url: `${c.env.HOMEPAGE_URL}/pro?status=cancel`,
    // subscription_data.metadata is what the webhook reads — Checkout-session
    // metadata doesn't propagate to subscription.created events.
    subscription_data: {
      metadata: { api_key_id: String(row.id) },
    },
    metadata: { flow: "pro_subscribe", api_key_id: String(row.id) },
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

  const sql = db(c.env.DATABASE_URL);

  // --- Subscription lifecycle (Pro $8/mo) ----------------------------------
  // Idempotent: upsertSubscription/setSubscriptionStatus key on
  // stripe_subscription_id, so duplicate deliveries converge.
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const apiKeyId = Number(sub.metadata?.api_key_id ?? 0);
    if (!apiKeyId) return c.text("missing api_key_id metadata", 400);
    await upsertSubscription(sql, {
      apiKeyId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      status: mapSubStatus(sub.status),
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    });
    return c.text("ok", 200);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await setSubscriptionStatus(sql, {
      stripeSubscriptionId: sub.id,
      status: "cancelled",
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    });
    return c.text("ok", 200);
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge so Stripe stops retrying.
    return c.text("ok", 200);
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const flow = session.metadata?.flow;

  if (flow === "pro_subscribe") {
    // The actual subscription row is created by customer.subscription.created.
    // Nothing to do here beyond acknowledging.
    return c.text("ok", 200);
  }

  if (flow === "new_key") {
    if (await topUpAlreadyApplied(sql, session.id)) return c.text("ok", 200);

    const email = session.metadata?.email ?? session.customer_email ?? "";
    const amountCents = Number(session.metadata?.amount_usd_cents ?? 0);
    if (!email || !amountCents) return c.text("bad metadata", 400);

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

    await sendNewKeyEmail(c.env, {
      to: email,
      apiKey,
      credits,
      baseUrl: c.env.PUBLIC_BASE_URL + "/v1",
    });
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

    // Look up email + new balance for the receipt
    const row = (await sql`
      SELECT email, key_prefix, credits_remaining
      FROM api_keys WHERE id = ${apiKeyId}
    `) as { email: string; key_prefix: string; credits_remaining: number }[];
    const r = row[0];
    if (r) {
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

/** Map Stripe's subscription status strings to our 3-bucket schema. */
function mapSubStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "cancelled";
}

// Silence unused-import warning for findKeyByEmail (kept for /lookup if added later).
void findKeyByEmail;
