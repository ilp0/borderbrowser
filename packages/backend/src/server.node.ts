/**
 * Node.js entrypoint for self-hosting the BorderBrowser backend.
 *
 * The same Hono `app` from `index.ts` runs unchanged. This file:
 *   - reads configuration from `process.env` instead of Cloudflare bindings,
 *   - passes the env + an `executionCtx` polyfill to `app.fetch(req, env, ctx)`
 *     so route handlers keep using `c.env.*` and `c.executionCtx.waitUntil()`,
 *   - swaps the Neon-HTTP db factory for a vanilla `pg` one,
 *   - boots an HTTP server with `@hono/node-server` on PORT (default 8787).
 *
 * The Cloudflare Worker entrypoint (`index.ts` exporting `app`) is untouched,
 * so `wrangler dev` / `wrangler deploy` still work exactly as before.
 *
 * Caveats documented in docs/SELF_HOST.md:
 *   - No KV-backed edge cache.
 *   - `executionCtx.waitUntil` is fire-and-forget: rejections are logged
 *     rather than crashing the process.
 */

import { serve } from "@hono/node-server";
import { pgFactory } from "./db.pg.ts";
import { setDbFactory } from "./db.ts";
import app from "./index.ts";
import type { Env } from "./types.ts";

setDbFactory(pgFactory);

function readEnv(): Env {
  const required = [
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "OPENROUTER_KEY",
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `Missing required env vars: ${missing.join(", ")}. ` +
        `See docs/SELF_HOST.md for setup.`,
    );
    process.exit(1);
  }
  return {
    PUBLIC_BASE_URL: process.env["PUBLIC_BASE_URL"] ?? "http://localhost:8787",
    HOMEPAGE_URL: process.env["HOMEPAGE_URL"] ?? "http://localhost:8787",
    EMAIL_FROM: process.env["EMAIL_FROM"] ?? "BorderBrowser <noreply@localhost>",
    MARGIN_BPS: process.env["MARGIN_BPS"] ?? "3000",
    DATABASE_URL: process.env["DATABASE_URL"]!,
    STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"]!,
    STRIPE_WEBHOOK_SECRET: process.env["STRIPE_WEBHOOK_SECRET"]!,
    RESEND_API_KEY: process.env["RESEND_API_KEY"]!,
    OPENROUTER_KEY: process.env["OPENROUTER_KEY"]!,
  };
}

const env = readEnv();

// Workers' executionCtx.waitUntil keeps a request alive until the bg promise
// resolves. In a long-running Node process we don't need that guarantee —
// fire-and-forget is fine. If the promise rejects, log it instead of letting
// it bubble up as an unhandled rejection that would crash the process.
const executionCtx: ExecutionContext = {
  waitUntil(p: Promise<unknown>): void {
    void p.catch((err: unknown) => {
      console.error("[waitUntil] background task failed:", err);
    });
  },
  passThroughOnException(): void {},
  props: {},
};

const port = Number(process.env["PORT"] ?? 8787);
const hostname = process.env["HOST"] ?? "0.0.0.0";

serve(
  {
    port,
    hostname,
    fetch: (req) => app.fetch(req, env, executionCtx),
  },
  (info) => {
    console.log(
      `BorderBrowser backend listening on http://${info.address}:${info.port}`,
    );
  },
);
