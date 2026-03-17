-- Add 'generated' to sites status CHECK constraint
-- Represents a site that has been built but not yet deployed.
-- Flow: draft → generating → generated → deploying → dns_pending → ssl_pending → live

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_n_check;

ALTER TABLE sites ADD CONSTRAINT sites_n_check CHECK (
  status IN ('draft','generating','generated','deploying','dns_pending','ssl_pending','live','paused','error')
);
