/**
 * Database access layer (Postgres via Neon's HTTP driver — works on Cloudflare
 * Workers without TCP). All money columns are BIGINT microdollars.
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Usage } from "./pricing.ts";

export type Db = NeonQueryFunction<false, false>;

export type ApiKeyRow = {
  id: number;
  key_hash: string;
  key_prefix: string;
  email: string;
  credits_remaining: number;
  total_credits_purchased: number;
  revoked: boolean;
};

export function db(databaseUrl: string): Db {
  return neon(databaseUrl);
}

export async function findKeyByHash(sql: Db, hash: string): Promise<ApiKeyRow | null> {
  const rows = (await sql`
    SELECT id, key_hash, key_prefix, email, credits_remaining,
           total_credits_purchased, revoked
    FROM api_keys
    WHERE key_hash = ${hash}
    LIMIT 1
  `) as ApiKeyRow[];
  return rows[0] ?? null;
}

export async function insertApiKey(
  sql: Db,
  args: { keyHash: string; keyPrefix: string; email: string },
): Promise<number> {
  const rows = (await sql`
    INSERT INTO api_keys (key_hash, key_prefix, email)
    VALUES (${args.keyHash}, ${args.keyPrefix}, ${args.email})
    RETURNING id
  `) as { id: number }[];
  return rows[0]!.id;
}

export async function findKeyByEmail(sql: Db, email: string): Promise<ApiKeyRow | null> {
  const rows = (await sql`
    SELECT id, key_hash, key_prefix, email, credits_remaining,
           total_credits_purchased, revoked
    FROM api_keys
    WHERE email = ${email} AND revoked = false
    ORDER BY created_at DESC
    LIMIT 1
  `) as ApiKeyRow[];
  return rows[0] ?? null;
}

/** Atomically deduct credits and bump last_used_at. Returns new balance. */
export async function deductCredits(
  sql: Db,
  args: { apiKeyId: number; creditsToDeduct: number },
): Promise<number> {
  const rows = (await sql`
    UPDATE api_keys
    SET credits_remaining = credits_remaining - ${args.creditsToDeduct},
        last_used_at = now(),
        updated_at = now()
    WHERE id = ${args.apiKeyId}
    RETURNING credits_remaining
  `) as { credits_remaining: number }[];
  return rows[0]?.credits_remaining ?? 0;
}

export async function logUsage(
  sql: Db,
  args: {
    apiKeyId: number;
    model: string;
    usage: Usage;
    upstreamCostMicros: number;
    creditsCharged: number;
  },
): Promise<void> {
  await sql`
    INSERT INTO usage_log (
      api_key_id, model, input_tokens, output_tokens,
      cached_input_tokens, upstream_cost_micros, credits_charged
    ) VALUES (
      ${args.apiKeyId}, ${args.model}, ${args.usage.inputTokens},
      ${args.usage.outputTokens}, ${args.usage.cachedInputTokens},
      ${args.upstreamCostMicros}, ${args.creditsCharged}
    )
  `;
}

export async function recordTopUp(
  sql: Db,
  args: {
    apiKeyId: number;
    stripeSessionId: string;
    stripePaymentIntent?: string | undefined;
    amountUsdCents: number;
    creditsAdded: number;
  },
): Promise<void> {
  // Idempotent on stripe_session_id: a duplicate webhook delivery is a no-op.
  await sql`
    INSERT INTO top_ups (
      api_key_id, stripe_session_id, stripe_payment_intent,
      amount_usd_cents, credits_added, status
    ) VALUES (
      ${args.apiKeyId}, ${args.stripeSessionId},
      ${args.stripePaymentIntent ?? null}, ${args.amountUsdCents},
      ${args.creditsAdded}, 'succeeded'
    )
    ON CONFLICT (stripe_session_id) DO NOTHING
  `;
}

export async function addCredits(
  sql: Db,
  args: { apiKeyId: number; creditsToAdd: number },
): Promise<void> {
  await sql`
    UPDATE api_keys
    SET credits_remaining = credits_remaining + ${args.creditsToAdd},
        total_credits_purchased = total_credits_purchased + ${args.creditsToAdd},
        updated_at = now()
    WHERE id = ${args.apiKeyId}
  `;
}

export async function topUpAlreadyApplied(
  sql: Db,
  stripeSessionId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM top_ups WHERE stripe_session_id = ${stripeSessionId} LIMIT 1
  `) as { "?column?": number }[];
  return rows.length > 0;
}

// --- Pro subscriptions ($8/mo) ----------------------------------------------

export type SubscriptionStatus = "active" | "cancelled" | "past_due";

export type SubscriptionRow = {
  id: number;
  api_key_id: number;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
};

export async function findSubscriptionByApiKey(
  sql: Db,
  apiKeyId: number,
): Promise<SubscriptionRow | null> {
  const rows = (await sql`
    SELECT id, api_key_id, stripe_subscription_id, stripe_customer_id,
           status, current_period_end
    FROM subscriptions
    WHERE api_key_id = ${apiKeyId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as SubscriptionRow[];
  return rows[0] ?? null;
}

/**
 * Insert or update a subscription, keyed on stripe_subscription_id. Idempotent
 * — webhooks for create + update on the same sub converge to one row.
 */
export async function upsertSubscription(
  sql: Db,
  args: {
    apiKeyId: number;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO subscriptions (
      api_key_id, stripe_subscription_id, stripe_customer_id,
      status, current_period_end
    ) VALUES (
      ${args.apiKeyId}, ${args.stripeSubscriptionId}, ${args.stripeCustomerId},
      ${args.status}, ${args.currentPeriodEnd}
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
  `;
}

export async function setSubscriptionStatus(
  sql: Db,
  args: {
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodEnd?: Date | null;
  },
): Promise<void> {
  await sql`
    UPDATE subscriptions
    SET status = ${args.status},
        current_period_end = COALESCE(${args.currentPeriodEnd ?? null}, current_period_end),
        updated_at = now()
    WHERE stripe_subscription_id = ${args.stripeSubscriptionId}
  `;
}

/** True if the user currently has an active sub whose period hasn't lapsed. */
export async function isPro(sql: Db, apiKeyId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM subscriptions
    WHERE api_key_id = ${apiKeyId}
      AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
    LIMIT 1
  `) as { "?column?": number }[];
  return rows.length > 0;
}
