/**
 * BorderBrowser API entry point (Cloudflare Worker).
 *
 *   GET  /                       — health check / banner
 *   POST /v1/chat/completions    — OpenAI-compatible proxy (auth = Bearer bb_live_…)
 *   GET  /v1/credits             — balance lookup for an issued key
 *   POST /buy                    — Stripe Checkout for a new key
 *   POST /topup                  — Stripe Checkout to add credits to an existing key
 *   POST /webhook                — Stripe webhook (mints/credits keys, sends email)
 */
import { Hono } from "hono";
import { billing } from "./billing.ts";
import { proxy } from "./proxy.ts";
import type { Env } from "./types.ts";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  // Permissive CORS for the extension and homepage. Any browser origin can
  // POST /v1/chat/completions with our key — that's the whole point.
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Title, HTTP-Referer",
  );
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.get("/", (c) =>
  c.json({
    name: "BorderBrowser API",
    docs: c.env.HOMEPAGE_URL,
    endpoints: ["/v1/chat/completions", "/v1/credits", "/buy", "/topup"],
  }),
);

app.route("/", proxy);
app.route("/", billing);

export default app;
