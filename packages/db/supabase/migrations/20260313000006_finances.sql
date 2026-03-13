-- Migration 006: Finances — cost tracking and revenue tables.
-- Applies: cost_categories, costs, revenue_amazon, revenue_adsense, revenue_manual, revenue_daily.

-- ---------------------------------------------------------------------------
-- cost_categories — fixed taxonomy of cost types
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_categories (
  slug        text PRIMARY KEY,
  name        text NOT NULL
);

INSERT INTO cost_categories (slug, name) VALUES
  ('hosting', 'Hosting'),
  ('domains', 'Domains'),
  ('ai',      'AI / LLM'),
  ('tools',   'Tools & Services'),
  ('other',   'Other')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- costs — individual cost entries
-- site_id nullable: some costs (e.g. hosting) are portfolio-wide
-- period: 'one-time'|'monthly'|'annual'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS costs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug   text        NOT NULL REFERENCES cost_categories(slug),
  description     text,
  amount          numeric     NOT NULL,
  currency        text        NOT NULL DEFAULT 'EUR',
  period          text,               -- 'one-time'|'monthly'|'annual'
  site_id         uuid        REFERENCES sites(id) ON DELETE SET NULL,
  date            date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE costs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- revenue_amazon — Amazon Associates revenue per site per day
-- D009: Phase 1 = manual CSV import; Phase 2 = API sync
-- market: the Amazon marketplace ('ES','US','UK', etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_amazon (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date           date        NOT NULL,
  clicks         int         NOT NULL DEFAULT 0,
  items_ordered  int         NOT NULL DEFAULT 0,
  earnings       numeric     NOT NULL DEFAULT 0,
  currency       text        NOT NULL DEFAULT 'EUR',
  market         text,               -- 'ES','US','UK', etc.
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, date, market)
);

ALTER TABLE revenue_amazon ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- revenue_adsense — AdSense revenue per site per day (Phase 2+)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_adsense (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  earnings    numeric     NOT NULL DEFAULT 0,
  clicks      int         NOT NULL DEFAULT 0,
  impressions int         NOT NULL DEFAULT 0,
  rpm         numeric,
  currency    text        NOT NULL DEFAULT 'EUR',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, date)
);

ALTER TABLE revenue_adsense ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- revenue_manual — one-off manual revenue entries
-- site_id nullable: portfolio-wide revenue entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_manual (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid        REFERENCES sites(id) ON DELETE SET NULL,
  source     text,
  amount     numeric     NOT NULL,
  currency   text        NOT NULL DEFAULT 'EUR',
  date       date        NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenue_manual ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- revenue_daily — pre-aggregated daily totals across all revenue streams
-- Composite PK prevents duplicate rows per site+date.
-- breakdown jsonb: {amazon: n, adsense: n, manual: n}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_daily (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date           date        NOT NULL,
  total_revenue  numeric     NOT NULL DEFAULT 0,
  breakdown      jsonb,              -- {amazon: n, adsense: n, manual: n}
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, date)
);

ALTER TABLE revenue_daily ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_costs_site_id          ON costs(site_id);
CREATE INDEX IF NOT EXISTS idx_costs_category_slug    ON costs(category_slug);
CREATE INDEX IF NOT EXISTS idx_costs_date             ON costs(date);
CREATE INDEX IF NOT EXISTS idx_revenue_amazon_site_id ON revenue_amazon(site_id);
CREATE INDEX IF NOT EXISTS idx_revenue_amazon_date    ON revenue_amazon(date);
CREATE INDEX IF NOT EXISTS idx_revenue_daily_site_id  ON revenue_daily(site_id);
CREATE INDEX IF NOT EXISTS idx_revenue_daily_date     ON revenue_daily(date);
