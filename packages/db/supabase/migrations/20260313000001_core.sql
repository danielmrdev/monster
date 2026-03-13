-- Migration 001: Core infrastructure tables.
-- Applies: site_types, site_templates, sites, settings, domains, deployments.

-- ---------------------------------------------------------------------------
-- site_types — extensibility anchor (D001)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_types (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL
);

INSERT INTO site_types (slug, name, description)
VALUES ('tsa', 'TSA (Amazon Affiliate)', 'Amazon affiliate catalog sites')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- site_templates — template variants per site type
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_templates (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  description text
);

INSERT INTO site_templates (slug, name, description) VALUES
  ('classic', 'Classic', 'Traditional grid layout with sidebar'),
  ('modern',  'Modern',  'Full-width clean layout with card grid'),
  ('minimal', 'Minimal', 'Lightweight single-column layout')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- sites — core site record, zero TSA-specific columns (D001)
-- status values per D005: draft|generating|deploying|dns_pending|ssl_pending|live|paused|error
-- focus_keyword per D006
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_type_slug  text        NOT NULL REFERENCES site_types(slug),
  template_slug   text        NOT NULL REFERENCES site_templates(slug),
  name            text        NOT NULL,
  domain          text        UNIQUE,
  niche           text,
  market          text,           -- 'ES','US','UK','DE','FR','IT','MX','CA','JP','AU'
  language        text,           -- 'es','en','de','fr','it','ja'
  currency        text,           -- 'EUR','USD','GBP','MXN','CAD','JPY','AUD'
  affiliate_tag   text,           -- D009: subtag format '<tag>-<siteslug>-20'
  customization   jsonb,          -- colors, typography, logo, favicon
  status          text        NOT NULL DEFAULT 'draft',
                                  -- D005: draft|generating|deploying|dns_pending|ssl_pending|live|paused|error
  focus_keyword   text,           -- D006: main keyword for homepage SEO
  company_name    text,
  contact_email   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_status_check CHECK (
    status IN ('draft','generating','deploying','dns_pending','ssl_pending','live','paused','error')
  )
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- settings — global key/value config store
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- domains — domain registration and DNS state (D004: Cloudflare)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  domain        text        NOT NULL UNIQUE,
  registrar     text,               -- 'spaceship'
  spaceship_id  text,               -- Spaceship registrar reference
  cf_zone_id    text,               -- Cloudflare zone ID (set after NS delegation)
  dns_status    text        NOT NULL DEFAULT 'pending',
                                    -- 'pending'|'active'|'error'
  registered_at timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domains_dns_status_check CHECK (
    dns_status IN ('pending','active','error')
  )
);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- deployments — deployment history per site
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending',
                                    -- 'pending'|'running'|'succeeded'|'failed'
  build_id     text,               -- internal build reference
  deployed_at  timestamptz,
  duration_ms  int,
  error        text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deployments_status_check CHECK (
    status IN ('pending','running','succeeded','failed')
  )
);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sites_status          ON sites(status);
CREATE INDEX IF NOT EXISTS idx_sites_site_type_slug  ON sites(site_type_slug);
CREATE INDEX IF NOT EXISTS idx_domains_site_id       ON domains(site_id);
CREATE INDEX IF NOT EXISTS idx_deployments_site_id   ON deployments(site_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status    ON deployments(status);
