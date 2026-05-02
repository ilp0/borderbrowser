/**
 * Per-model upstream pricing (OpenRouter pass-through to Anthropic, OpenAI, etc.)
 * and credit accounting.
 *
 * Prices are dollars per million tokens, frozen at deploy time. Update
 * periodically — when in doubt, look up the model on
 * https://openrouter.ai/models. If a model isn't in this table, the proxy
 * rejects the request (whitelist for safety so users can't burn balance on a
 * model we don't price).
 *
 * Credits are microdollars. The proxy applies a margin (configured via
 * MARGIN_BPS in wrangler.toml — basis points, so 3000 = 30%).
 */

export type ModelPricing = {
  /** Input tokens, $/M. */
  input: number;
  /** Output tokens, $/M. */
  output: number;
  /** Cached input tokens, $/M (Anthropic prompt caching reads are cheaper). */
  cachedInput?: number;
};

export const PRICES: Record<string, ModelPricing> = {
  "anthropic/claude-haiku-4.5": { input: 1.0, output: 5.0, cachedInput: 0.1 },
  "anthropic/claude-sonnet-4.6": { input: 3.0, output: 15.0, cachedInput: 0.3 },
  "anthropic/claude-opus-4.7":   { input: 15.0, output: 75.0, cachedInput: 1.5 },
  "openai/gpt-4.1-mini":         { input: 0.4, output: 1.6 },
  "openai/gpt-4.1":              { input: 2.0, output: 8.0 },
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

/**
 * Returns the upstream cost of a single call in microdollars (1 USD = 1_000_000).
 */
export function upstreamCostMicros(model: string, usage: Usage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`Unsupported model: ${model}`);

  const fresh = usage.inputTokens - usage.cachedInputTokens;
  const inputCost = (fresh / 1_000_000) * p.input;
  const cachedCost = ((p.cachedInput ?? p.input) / 1_000_000) * usage.cachedInputTokens;
  const outputCost = (usage.outputTokens / 1_000_000) * p.output;

  const totalUsd = inputCost + cachedCost + outputCost;
  return Math.ceil(totalUsd * 1_000_000);
}

/**
 * Apply margin (basis points) to the upstream cost.
 * marginBps=3000 → 30% on top; an upstream cost of 100 micros becomes 130.
 */
export function withMargin(upstreamMicros: number, marginBps: number): number {
  return Math.ceil(upstreamMicros * (10_000 + marginBps) / 10_000);
}

/**
 * Convert a USD-cent purchase amount to microdollar credits.
 * $5 (500 cents) → 5_000_000 microdollar credits.
 */
export function usdCentsToMicros(cents: number): number {
  return cents * 10_000;
}
