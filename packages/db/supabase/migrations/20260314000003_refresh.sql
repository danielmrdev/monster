-- Migration: add product refresh tracking columns to sites
-- D095: last_refreshed_at/refresh_interval_hours/next_refresh_at track per-site refresh cadence.
-- next_refresh_at is computed by the worker (last_refreshed_at + refresh_interval_hours * interval '1 hour')
-- and stored for easy scheduler queries without arithmetic in the WHERE clause.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS last_refreshed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_interval_hours int4 NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS next_refresh_at        timestamptz;
