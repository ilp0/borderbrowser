/**
 * Unit tests for src/pricing.ts. Verifies the cost-accounting invariants the
 * proxy relies on: margin is always non-negative, cached tokens are billed at
 * the cached rate when defined and the input rate when not, and unknown
 * models throw rather than silently billing $0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRICES,
  upstreamCostMicros,
  usdCentsToMicros,
  withMargin,
} from "../src/pricing.ts";

test("withMargin(0, _) is 0 regardless of margin", () => {
  assert.equal(withMargin(0, 0), 0);
  assert.equal(withMargin(0, 3000), 0);
  assert.equal(withMargin(0, 100_000), 0);
});

test("withMargin(x, bps>=0) is >= x for any positive x", () => {
  for (const x of [1, 10, 999, 1_000_000, 999_999_999]) {
    for (const bps of [0, 100, 3000, 10_000]) {
      assert.ok(
        withMargin(x, bps) >= x,
        `withMargin(${x}, ${bps}) = ${withMargin(x, bps)} < ${x}`,
      );
    }
  }
});

test("withMargin(x, 0) === x for integer x (no fractional inflation)", () => {
  for (const x of [1, 10, 1000, 9_999_999]) {
    assert.equal(withMargin(x, 0), x);
  }
});

test("withMargin applies basis points correctly with ceiling", () => {
  // 100 micros + 30% = 130 exactly
  assert.equal(withMargin(100, 3000), 130);
  // 1 micro + 30% = 1.3, ceiled to 2
  assert.equal(withMargin(1, 3000), 2);
  // 7 micros + 30% = 9.1, ceiled to 10
  assert.equal(withMargin(7, 3000), 10);
});

test("upstreamCostMicros throws for unknown model", () => {
  assert.throws(
    () =>
      upstreamCostMicros("anthropic/does-not-exist", {
        inputTokens: 100,
        outputTokens: 100,
        cachedInputTokens: 0,
      }),
    /Unsupported model/,
  );
});

test("upstreamCostMicros: zero usage yields zero cost", () => {
  for (const model of Object.keys(PRICES)) {
    const cost = upstreamCostMicros(model, {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
    });
    assert.equal(cost, 0, `expected 0 cost for ${model}`);
  }
});

test("upstreamCostMicros: input + output tokens use posted prices", () => {
  // claude-haiku-4.5: $1.0/M input, $5.0/M output. 1M input + 1M output = $6.
  const cost = upstreamCostMicros("anthropic/claude-haiku-4.5", {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cachedInputTokens: 0,
  });
  assert.equal(cost, 6_000_000);
});

test("upstreamCostMicros: cached tokens cheaper than fresh input (when defined)", () => {
  const usage = (cached: number) => ({
    inputTokens: 1_000_000,
    outputTokens: 0,
    cachedInputTokens: cached,
  });

  // claude-sonnet-4.6 has cachedInput = $0.3/M, input = $3.0/M.
  // 1M input, all cached → $0.30
  // 1M input, none cached → $3.00
  const allCached = upstreamCostMicros("anthropic/claude-sonnet-4.6", usage(1_000_000));
  const noneCached = upstreamCostMicros("anthropic/claude-sonnet-4.6", usage(0));
  assert.equal(allCached, 300_000);
  assert.equal(noneCached, 3_000_000);
  assert.ok(allCached < noneCached, "cached should cost strictly less");
});

test("upstreamCostMicros: cached tokens billed at input rate when cachedInput undefined", () => {
  // openai/gpt-4.1-mini has no cachedInput field, so cached tokens fall back
  // to the input rate ($0.4/M) — caching gives no discount on this model.
  const usage = (cached: number) => ({
    inputTokens: 1_000_000,
    outputTokens: 0,
    cachedInputTokens: cached,
  });
  const allCached = upstreamCostMicros("openai/gpt-4.1-mini", usage(1_000_000));
  const noneCached = upstreamCostMicros("openai/gpt-4.1-mini", usage(0));
  assert.equal(allCached, 400_000);
  assert.equal(noneCached, 400_000);
});

test("upstreamCostMicros: mixed cached/fresh splits cost correctly", () => {
  // claude-sonnet-4.6: input $3/M, cachedInput $0.3/M, output $15/M.
  // 1M input total, 250K of which cached, 500K output.
  // Fresh input: 0.75M * $3 = $2.25
  // Cached:      0.25M * $0.3 = $0.075
  // Output:      0.5M * $15 = $7.5
  // Total = $9.825 = 9_825_000 micros
  const cost = upstreamCostMicros("anthropic/claude-sonnet-4.6", {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cachedInputTokens: 250_000,
  });
  assert.equal(cost, 9_825_000);
});

test("upstreamCostMicros result is an integer (microdollar accounting)", () => {
  // Even with awkward token counts, the result should always be an integer.
  const cost = upstreamCostMicros("anthropic/claude-haiku-4.5", {
    inputTokens: 137,
    outputTokens: 89,
    cachedInputTokens: 11,
  });
  assert.equal(Number.isInteger(cost), true);
  assert.ok(cost >= 0);
});

test("usdCentsToMicros converts cents to microdollars", () => {
  assert.equal(usdCentsToMicros(0), 0);
  assert.equal(usdCentsToMicros(1), 10_000);
  assert.equal(usdCentsToMicros(500), 5_000_000); // $5
  assert.equal(usdCentsToMicros(10_000), 100_000_000); // $100
});
