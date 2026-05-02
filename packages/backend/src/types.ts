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
  RESEND_API_KEY: string;
  OPENROUTER_KEY: string;
  // KV namespaces
  /**
   * Edge translation cache (Vision §8). Optional binding — code degrades
   * gracefully when missing so local dev without `wrangler dev --kv` works.
   */
  TRANSLATION_CACHE?: KVNamespace;
};
