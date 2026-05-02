/** Cloudflare Worker bindings. Mirrors wrangler.toml + secrets. */
export type Env = {
  // vars
  PUBLIC_BASE_URL: string;
  HOMEPAGE_URL: string;
  EMAIL_FROM: string;
  MARGIN_BPS: string;
  // secrets
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;            // recurring $8/mo price (set via wrangler secret)
  RESEND_API_KEY: string;
  OPENROUTER_KEY: string;
};
