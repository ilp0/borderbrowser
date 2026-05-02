-- Anonymous key pickup table.
--
-- For anonymous (no-email) purchases, we have no way to email the key. The
-- success page must fetch it by Stripe session id. We deliberately store the
-- raw key here for that single retrieval, then delete it on first read.
--
-- This is the ONLY place a raw key sits in our DB, and only for anonymous
-- flow, only briefly. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS anon_key_pickup (
    stripe_session_id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
