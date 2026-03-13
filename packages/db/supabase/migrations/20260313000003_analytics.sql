-- Migration 003: Analytics tracking tables.
-- Applies: analytics_events, analytics_daily.
-- analytics_events: INSERT-only for anon role (generated sites post directly to Supabase).
-- analytics_daily: aggregated view, no anon access.
-- D011: country detection via CF-IPCountry header (logged in country field).
-- Note: analytics_events implemented as a regular table with cron cleanup (not partitioned).
--   Partitioning by month deferred to a future migration when volume warrants it.

-- ---------------------------------------------------------------------------
-- analytics_events — raw event stream (90-day retention via cron, Phase 2)
-- visitor_hash = hash(date + IP + UA) — raw IP never stored (GDPR-friendly)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type   text        NOT NULL,   -- 'pageview'|'click_affiliate'|'click_category'
  page_path    text,
  referrer     text,
  country      text,                   -- D011: CF-IPCountry header value
  language     text,                   -- navigator.language from tracking script
  visitor_hash text,                   -- hashed daily identifier, no cross-day tracking
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: enable + INSERT-only for anon — the ONLY table exposed to anon key.
-- Generated sites post analytics directly to Supabase Cloud (no admin server hop).
-- WITH CHECK (true) is correct for INSERT policies; USING is for row-level reads.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON analytics_events
  FOR INSERT TO anon
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- analytics_daily — pre-aggregated daily stats per site + path
-- Composite PK prevents duplicate aggregation rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_daily (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          uuid    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date             date    NOT NULL,
  page_path        text    NOT NULL,
  pageviews        int     NOT NULL DEFAULT 0,
  unique_visitors  int     NOT NULL DEFAULT 0,
  affiliate_clicks int     NOT NULL DEFAULT 0,
  top_countries    jsonb,              -- {country_code: count, ...}
  top_referrers    jsonb,              -- {referrer: count, ...}
  UNIQUE(site_id, date, page_path)
);

ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_site_id    ON analytics_events(site_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_site_id     ON analytics_daily(site_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date        ON analytics_daily(date);
