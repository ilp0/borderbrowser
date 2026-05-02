# Self-hosting the BorderBrowser backend

The BorderBrowser backend ships as a Cloudflare Worker on the hosted service,
but the same code runs under Node.js for anyone who'd rather operate the proxy
themselves. This document walks through a single-machine Docker Compose setup:
one container for the API, one for Postgres, configured by environment
variables.

## What you get

A self-hosted backend exposes the same endpoints as the hosted version:

| Endpoint                   | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `POST /v1/chat/completions` | OpenAI-compatible proxy to OpenRouter   |
| `GET  /v1/credits`          | Balance lookup for an issued key        |
| `POST /buy`                 | Stripe Checkout for a new key           |
| `POST /topup`               | Stripe Checkout to credit an existing key |
| `POST /webhook`             | Stripe webhook (mints + credits keys)   |

You issue your own API keys (paid through your own Stripe account) and your
own users point their BorderBrowser extension at your backend's URL.

## Requirements

- Docker 24+ with `docker compose`
- Accounts (and API keys) with:
  - **OpenRouter** — funds the upstream LLM calls. <https://openrouter.ai>
  - **Stripe** — handles payments. <https://dashboard.stripe.com>
  - **Resend** — sends "here's your key" emails. <https://resend.com>

## Step 1: clone the repo

```sh
git clone https://github.com/borderbrowser/borderbrowser
cd borderbrowser
```

## Step 2: configure environment variables

Copy the example env file and fill in your secrets:

```sh
cat > .env <<'EOF'
# OpenRouter — pays for every upstream LLM call
OPENROUTER_KEY=sk-or-v1-...

# Stripe — your test keys for development, live keys in production
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend — for delivering API keys and top-up receipts
RESEND_API_KEY=re_...

# Optional: where the homepage / public API live
PUBLIC_BASE_URL=http://localhost:8787
HOMEPAGE_URL=http://localhost:8787
EMAIL_FROM=BorderBrowser <noreply@example.com>

# Optional: margin over OpenRouter cost in basis points (3000 = 30%)
MARGIN_BPS=3000

# Optional: Postgres password (default: borderbrowser)
POSTGRES_PASSWORD=changeme
EOF
```

`docker compose` reads `.env` automatically. Don't commit it.

## Step 3: bring up the stack

```sh
docker compose up -d --build
```

This starts:

- **db** — `postgres:16-alpine`, exposed on `localhost:5432`
- **backend** — Node 22 running the Hono app on `localhost:8787`

Watch the logs:

```sh
docker compose logs -f backend
```

You should see `BorderBrowser backend listening on http://0.0.0.0:8787`.

## Step 4: run the database migration

The schema is in `packages/backend/migrations/001_init.sql`. Apply it once:

```sh
docker compose exec db psql -U borderbrowser -d borderbrowser \
  -f /migrations/001_init.sql
```

(The compose file mounts `packages/backend/migrations` into the db container
at `/migrations`.)

## Step 5: tell Stripe where to send webhook events

For local development, use Stripe's CLI:

```sh
stripe listen --forward-to http://localhost:8787/webhook
```

It prints a `whsec_…` signing secret — put that in `STRIPE_WEBHOOK_SECRET` in
your `.env` and restart the backend (`docker compose up -d`).

For production, add a webhook in the Stripe dashboard pointing at
`https://<your-domain>/webhook` and listening for
`checkout.session.completed`.

## Step 6: point the extension at your backend

In the BorderBrowser browser extension:

1. Open the extension settings.
2. Set **API base URL** to `http://localhost:8787/v1` (or your public URL).
3. Either buy a key through your hosted homepage or insert one directly in
   the database for testing.

## Verifying it works

```sh
# Health check
curl http://localhost:8787/

# Lookup credits for a key (replace bb_live_… with a real one)
curl -H "Authorization: Bearer bb_live_..." http://localhost:8787/v1/credits
```

## How this differs from the hosted Cloudflare deployment

| Feature                       | Cloudflare Worker      | Self-host (Node)            |
| ----------------------------- | ---------------------- | --------------------------- |
| Database driver               | `@neondatabase/serverless` (HTTP) | `pg` (TCP)         |
| Database                      | Neon                   | Postgres 16 in Docker       |
| Edge cache (KV)               | Used for rate limits   | **Not available** — skipped |
| Background work (`waitUntil`) | Runs after response    | Fire-and-forget (logged on reject) |
| Cold-start latency            | Sub-100 ms             | None (long-running process) |

The Hono app code itself (`packages/backend/src/index.ts` and the routes it
mounts) is identical between both deployments. The Node entrypoint
(`packages/backend/src/server.node.ts`) is responsible for:

- Reading config from `process.env` and injecting it as `c.env`.
- Polyfilling `c.executionCtx.waitUntil` so the same routes work.
- Swapping the database factory to `pg` via `setDbFactory()` in `db.ts`.

## Architectural notes and caveats

- **No KV cache.** The hosted version uses Cloudflare KV for short-lived
  caches (e.g. rate-limit counters). The Node entrypoint skips this; if you
  need rate limiting, put the backend behind a reverse proxy (nginx, Caddy)
  with built-in rate limits, or add a Redis-backed middleware.
- **Single-instance only by default.** The provided compose file runs one
  `backend` container. If you scale to multiple instances, ensure your Stripe
  webhook deduplicates by session id (it already does — see
  `topUpAlreadyApplied` in `db.ts`).
- **TLS is your problem.** The container speaks HTTP on `:8787`. Put it
  behind Caddy / nginx / Cloudflare Tunnel for HTTPS in production.
- **Migrations are manual.** There's a single `001_init.sql` today — if more
  arrive, apply them with `psql` the same way as Step 4.

## Running without Docker

If you'd rather run the server directly:

```sh
cd packages/backend
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/borderbrowser \
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
RESEND_API_KEY=re_... \
OPENROUTER_KEY=sk-or-v1-... \
npm run start:node
```

Requires Node 22+ and a reachable Postgres database with the schema applied.

## Updating

```sh
git pull
docker compose up -d --build
```

Re-apply migrations if there are new ones in `packages/backend/migrations/`.
