-- BorderBrowser Pro subscriptions ($8/mo).
--
-- One row per Stripe subscription. The api_key_id is the user; in practice we
-- expect one active sub per key, but the schema is permissive (an old cancelled
-- row may coexist with a new active one). isPro() checks status='active' AND
-- current_period_end > now().

CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    status TEXT NOT NULL,                    -- active | cancelled | past_due
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_sub_id_idx
    ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_api_key_idx
    ON subscriptions(api_key_id);
