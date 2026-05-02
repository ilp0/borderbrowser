/**
 * Validation-only tests for POST /subscribe.
 *
 * We exercise paths that fail before any DB or Stripe call: invalid key,
 * malformed JSON. Network-touching paths (real Stripe / Postgres) are out of
 * scope for unit tests — those are covered by the manual recipe in the PR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { billing } from "../src/billing.ts";

const fakeEnv = {
  PUBLIC_BASE_URL: "http://localhost:8787",
  HOMEPAGE_URL: "http://localhost:3000",
  EMAIL_FROM: "test@example.com",
  MARGIN_BPS: "3000",
  DATABASE_URL: "postgresql://fake/fake",
  STRIPE_SECRET_KEY: "sk_test_fake",
  STRIPE_WEBHOOK_SECRET: "whsec_fake",
  STRIPE_PRO_PRICE_ID: "",          // unset → 503 path covered separately
  RESEND_API_KEY: "re_fake",
  OPENROUTER_KEY: "sk-or-fake",
};

function call(body: unknown) {
  return billing.request(
    "/subscribe",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    fakeEnv,
  );
}

test("rejects missing apiKey", async () => {
  const res = await call({});
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_key");
});

test("rejects malformed apiKey", async () => {
  const res = await call({ apiKey: "not-a-real-key" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_key");
});

test("rejects wrong-prefix apiKey", async () => {
  // 24-char body but wrong prefix — well-formed regex requires bb_live_.
  const res = await call({ apiKey: "xx_test_aB3kQ8wRp9zNvXm2yP4cTd5e" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_key");
});
