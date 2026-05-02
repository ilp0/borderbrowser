/**
 * Integration tests for the Stripe billing routes (/buy specifically). We
 * avoid hitting Stripe by injecting a stub `stripeFactory` whose
 * `checkout.sessions.create` records calls and returns a fake URL. The DB
 * factory is never invoked on the /buy paths exercised here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBilling, type StripeLike } from "../src/billing.ts";
import type { Db } from "../src/db.ts";
import type { Env } from "../src/types.ts";

const fakeEnv: Env = {
  PUBLIC_BASE_URL: "https://api.test",
  HOMEPAGE_URL: "https://test",
  EMAIL_FROM: "test@test",
  MARGIN_BPS: "3000",
  DATABASE_URL: "postgres://stub",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  RESEND_API_KEY: "re_x",
  OPENROUTER_KEY: "or_x",
};

/**
 * Build a billing app with stubs for both Stripe and the DB. Returns the
 * app plus introspection handles so tests can assert what got called.
 */
function makeBilling(): {
  app: ReturnType<typeof createBilling>;
  stripeCalls: unknown[];
  dbCalls: number;
} {
  const stripeCalls: unknown[] = [];
  let dbCalls = 0;

  const stripeStub: StripeLike = {
    checkout: {
      sessions: {
        // The real signature is overloaded; we cast to the SDK's type so the
        // factory shape stays narrow. The stub just records params and
        // returns a synthetic session URL.
        create: ((params: unknown) => {
          stripeCalls.push(params);
          return Promise.resolve({
            id: "cs_test_stub",
            url: "https://checkout.stripe.test/session_stub",
          });
        }) as unknown as StripeLike["checkout"]["sessions"]["create"],
      },
    },
    webhooks: {
      constructEventAsync: (() => {
        throw new Error("constructEventAsync should not be called from /buy tests");
      }) as unknown as StripeLike["webhooks"]["constructEventAsync"],
    },
  };

  const dbStub: Db = ((..._args: unknown[]) => {
    dbCalls++;
    return Promise.resolve([]);
  }) as unknown as Db;

  const app = createBilling({
    dbFactory: () => dbStub,
    stripeFactory: () => stripeStub,
  });

  return {
    app,
    stripeCalls,
    get dbCalls() {
      return dbCalls;
    },
  };
}

test("POST /buy with malformed email → 400 invalid_email, no Stripe call", async () => {
  const { app, stripeCalls } = makeBilling();
  const res = await app.request(
    "/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", amountUsdCents: 500 }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_email");
  assert.equal(stripeCalls.length, 0);
});

test("POST /buy with missing email → 400 invalid_email", async () => {
  const { app, stripeCalls } = makeBilling();
  const res = await app.request(
    "/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsdCents: 500 }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_email");
  assert.equal(stripeCalls.length, 0);
});

test("POST /buy with invalid amount (not in allow-list) → 400 invalid_amount", async () => {
  const { app, stripeCalls } = makeBilling();
  const res = await app.request(
    "/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", amountUsdCents: 750 }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_amount");
  assert.equal(stripeCalls.length, 0);
});

test("POST /buy with missing amount → 400 invalid_amount", async () => {
  const { app, stripeCalls } = makeBilling();
  const res = await app.request(
    "/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_amount");
  assert.equal(stripeCalls.length, 0);
});

test("POST /buy with valid input → 200 + Stripe session URL", async () => {
  const { app, stripeCalls } = makeBilling();
  const res = await app.request(
    "/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", amountUsdCents: 500 }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { url: string };
  assert.equal(body.url, "https://checkout.stripe.test/session_stub");

  // Verify the Stripe stub got called once with the right shape.
  assert.equal(stripeCalls.length, 1);
  const params = stripeCalls[0] as {
    customer_email: string;
    line_items: { price_data: { unit_amount: number; currency: string } }[];
    metadata: { flow: string; email: string; amount_usd_cents: string };
  };
  assert.equal(params.customer_email, "user@example.com");
  assert.equal(params.line_items[0]!.price_data.unit_amount, 500);
  assert.equal(params.line_items[0]!.price_data.currency, "usd");
  assert.equal(params.metadata.flow, "new_key");
  assert.equal(params.metadata.email, "user@example.com");
  assert.equal(params.metadata.amount_usd_cents, "500");
});
