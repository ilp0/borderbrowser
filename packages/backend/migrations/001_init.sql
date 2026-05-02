-- BorderBrowser backend schema.
--
-- Credits are stored as integer microdollars (one credit = $0.000001 of LLM
-- cost). This avoids floating-point in money math. To express balances in user
-- units we divide by 1_000_000 in the UI.

CREATE TABLE IF NOT EXISTS api_keys (
    id BIGSERIAL PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,           -- sha256 of the issued key (we never store the raw key)
    key_prefix TEXT NOT NULL,                -- first 12 chars for display ("bb_live_aB3…")
    email TEXT NOT NULL,
    credits_remaining BIGINT NOT NULL DEFAULT 0,  -- microdollars remaining
    total_credits_purchased BIGINT NOT NULL DEFAULT 0,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_email_idx ON api_keys(email);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS top_ups (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    stripe_session_id TEXT UNIQUE NOT NULL,
    stripe_payment_intent TEXT,
    amount_usd_cents BIGINT NOT NULL,
    credits_added BIGINT NOT NULL,           -- microdollars
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | succeeded | failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS top_ups_api_key_idx ON top_ups(api_key_id);

CREATE TABLE IF NOT EXISTS usage_log (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    input_tokens INT NOT NULL,
    output_tokens INT NOT NULL,
    cached_input_tokens INT NOT NULL DEFAULT 0,
    upstream_cost_micros BIGINT NOT NULL,    -- LLM provider cost
    credits_charged BIGINT NOT NULL,         -- what we deducted from balance (incl. margin)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_log_api_key_created_idx ON usage_log(api_key_id, created_at DESC);
