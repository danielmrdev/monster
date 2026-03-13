-- Migration 007: Product and site alert tracking.
-- Applies: product_alerts.
-- Alert types: unavailable|category_empty|site_degraded
-- Triggered by product refresh cron (M006) and deployment monitor.

-- ---------------------------------------------------------------------------
-- product_alerts — issues detected during product refresh or monitoring
-- product_id nullable: some alerts (site_degraded) are not product-specific
-- status: 'open'|'acknowledged'|'resolved'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_alerts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id   uuid        REFERENCES tsa_products(id) ON DELETE SET NULL,
  alert_type   text        NOT NULL,   -- 'unavailable'|'category_empty'|'site_degraded'
  status       text        NOT NULL DEFAULT 'open',
                                       -- 'open'|'acknowledged'|'resolved'
  details      jsonb,                  -- additional context (asin, category_id, error, etc.)
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CONSTRAINT product_alerts_alert_type_check CHECK (
    alert_type IN ('unavailable','category_empty','site_degraded')
  ),
  CONSTRAINT product_alerts_status_check CHECK (
    status IN ('open','acknowledged','resolved')
  )
);

ALTER TABLE product_alerts ENABLE ROW LEVEL SECURITY;

-- Indexes — primary query patterns: open alerts per site, alerts by type
CREATE INDEX IF NOT EXISTS idx_product_alerts_site_id    ON product_alerts(site_id);
CREATE INDEX IF NOT EXISTS idx_product_alerts_product_id ON product_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_product_alerts_status     ON product_alerts(status);
CREATE INDEX IF NOT EXISTS idx_product_alerts_alert_type ON product_alerts(alert_type);
