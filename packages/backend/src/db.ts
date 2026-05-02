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
  email: string | null;
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
  args: { keyHash: string; keyPrefix: string; email: string | null },
): Promise<number> {
  const rows = (await sql`
    INSERT INTO api_keys (key_hash, key_prefix, email)
    VALUES (${args.keyHash}, ${args.keyPrefix}, ${args.email})
    RETURNING id
  `) as { id: number }[];
  return rows[0]!.id;
}

export async function findKeyByEmail(sql: Db, email: string): Promise<ApiKeyRow | null> {
  // Anonymous keys have email = NULL and are never matched here by design.
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

/**
 * Anonymous-flow key pickup: stash the raw key briefly so the success page
 * can retrieve it by Stripe session id (no email = no other delivery channel).
 * This is the only place a raw key lands in our DB.
 */
export async function stashAnonKey(
  sql: Db,
  args: { stripeSessionId: string; apiKey: string },
): Promise<void> {
  await sql`
    INSERT INTO anon_key_pickup (stripe_session_id, api_key)
    VALUES (${args.stripeSessionId}, ${args.apiKey})
    ON CONFLICT (stripe_session_id) DO NOTHING
  `;
}

/**
 * Single-read retrieval of an anonymous key. Deletes the row on the way out so
 * the raw key never lingers. Returns null if already retrieved or unknown.
 */
export async function popAnonKey(
  sql: Db,
  stripeSessionId: string,
): Promise<string | null> {
  const rows = (await sql`
    DELETE FROM anon_key_pickup
    WHERE stripe_session_id = ${stripeSessionId}
    RETURNING api_key
  `) as { api_key: string }[];
  return rows[0]?.api_key ?? null;
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
