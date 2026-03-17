-- Add is_active flag to sites.
-- When false, the site is excluded from all automated scheduled jobs
-- (product refresh, generate, deploy). Manual actions are still allowed.

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN sites.is_active IS
  'When false, site is excluded from all automated scheduled jobs (product refresh, generate, deploy).';

CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);
