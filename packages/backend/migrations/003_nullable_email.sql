-- Allow api_keys.email to be NULL for anonymous (no-email) purchases.
--
-- Postgres has no `ALTER COLUMN ... DROP NOT NULL IF EXISTS`, but DROP NOT NULL
-- on an already-nullable column is a no-op, so this migration is idempotent
-- and safe to re-run.

ALTER TABLE api_keys ALTER COLUMN email DROP NOT NULL;
