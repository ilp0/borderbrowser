-- Edge cache for paid users (Vision §8).
--
-- Mark usage rows that were served from the shared translation cache. These
-- rows have credits_charged = 0 because the cache hit cost the user nothing.

ALTER TABLE usage_log
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT false;
