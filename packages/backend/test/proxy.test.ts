/**
 * Integration tests for the /v1 proxy. We use Hono's `app.request(...)` so we
 * never bind a port; the DB factory is stubbed to avoid Postgres. The four
 * cases here all return before any other side effects (OpenRouter,
 * executionCtx.waitUntil), so the stub only needs to answer findKeyByHash.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProxy } from "../src/proxy.ts";
import type { Db } from "../src/db.ts";
import type { Env } from "../src/types.ts";

/**
 * Minimal env stub. The proxy reads HOMEPAGE_URL and DATABASE_URL on the
 * paths we exercise; the rest is harmless filler for the type checker.
 */
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
 * A `Db` stub that records every SQL template call and answers with the
 * provided rows. Tagged-template calls behave like Neon's `sql` does — they
 * return a Promise resolving to an array of rows.
 */
function makeStubDb(answer: (calls: number) => unknown[]): {
  factory: (url: string) => Db;
  calls: { strings: TemplateStringsArray; values: unknown[] }[];
} {
  const calls: { strings: TemplateStringsArray; values: unknown[] }[] = [];
  let n = 0;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ strings, values });
    return Promise.resolve(answer(n++));
  }) as unknown as Db;
  return {
    factory: () => sql,
    calls,
  };
}

test("POST /v1/chat/completions without Authorization → 401 missing_authorization", async () => {
  const stub = makeStubDb(() => []);
  const app = createProxy({ dbFactory: stub.factory });
  const res = await app.request(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "anthropic/claude-haiku-4.5" }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "missing_authorization");
  // The stub DB must NOT have been touched on this path.
  assert.equal(stub.calls.length, 0);
});

test("POST /v1/chat/completions with malformed key → 401 invalid_key_format", async () => {
  const stub = makeStubDb(() => []);
  const app = createProxy({ dbFactory: stub.factory });
  const res = await app.request(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-a-bb-key",
      },
      body: JSON.stringify({ model: "anthropic/claude-haiku-4.5" }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "invalid_key_format");
  assert.equal(stub.calls.length, 0);
});

test("POST /v1/chat/completions with well-formed but absent key → 401 key_not_found", async () => {
  // Stub returns no rows → findKeyByHash resolves to null → 401.
  const stub = makeStubDb(() => []);
  const app = createProxy({ dbFactory: stub.factory });
  const res = await app.request(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e",
      },
      body: JSON.stringify({ model: "anthropic/claude-haiku-4.5" }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "key_not_found");
  // We expect exactly one DB hit — the SELECT in findKeyByHash.
  assert.equal(stub.calls.length, 1);
});

test("POST /v1/chat/completions with empty Bearer token → 401 missing_authorization", async () => {
  // Whitespace-only bearer is treated the same as missing — defense in depth.
  const stub = makeStubDb(() => []);
  const app = createProxy({ dbFactory: stub.factory });
  const res = await app.request(
    "/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer   ",
      },
      body: JSON.stringify({ model: "anthropic/claude-haiku-4.5" }),
    },
    fakeEnv,
  );
  assert.equal(res.status, 401);
});
