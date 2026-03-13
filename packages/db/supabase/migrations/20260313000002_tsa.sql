-- Migration 002: TSA (Amazon Affiliate) site-type tables.
-- Applies: tsa_categories, tsa_products, category_products.
-- All tables join to sites via site_id — no TSA columns in sites (D001).

-- ---------------------------------------------------------------------------
-- tsa_categories — category pages for TSA sites
-- focus_keyword per D006
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tsa_categories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  slug            text        NOT NULL,
  description     text,
  seo_text        text,
  focus_keyword   text,               -- D006: SEO focus keyword for this category
  keywords        text[],             -- related keywords array
  category_image  text,               -- local path to representative product image
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, slug)
);

ALTER TABLE tsa_categories ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- tsa_products — product records sourced from DataForSEO/Amazon
-- focus_keyword per D006
-- availability: 'available'|'unavailable'|'limited'
-- price_history jsonb: [{date, price, original_price}] — unbounded in Phase 1
-- pros_cons jsonb: {pros: string[], cons: string[]}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tsa_products (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                 uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  asin                    text        NOT NULL,
  title                   text,
  slug                    text,
  current_price           numeric,
  original_price          numeric,
  images                  text[],             -- local WebP paths (never hotlinked)
  rating                  numeric,
  review_count            int,
  availability            text,               -- 'available'|'unavailable'|'limited'
  is_prime                boolean     NOT NULL DEFAULT false,
  condition               text,               -- 'new'|'used'|'renewed'
  detailed_description    text,
  pros_cons               jsonb,              -- {pros: string[], cons: string[]}
  user_opinions_summary   text,
  focus_keyword           text,               -- D006
  last_checked_at         timestamptz,        -- when DataForSEO last validated
  price_history           jsonb,              -- [{date, price, original_price}]
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, asin)
);

ALTER TABLE tsa_products ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- category_products — many-to-many between categories and products
-- position controls display order within a category
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_products (
  category_id uuid NOT NULL REFERENCES tsa_categories(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES tsa_products(id)   ON DELETE CASCADE,
  position    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, product_id)
);

ALTER TABLE category_products ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tsa_categories_site_id ON tsa_categories(site_id);
CREATE INDEX IF NOT EXISTS idx_tsa_products_site_id   ON tsa_products(site_id);
CREATE INDEX IF NOT EXISTS idx_tsa_products_asin      ON tsa_products(asin);
CREATE INDEX IF NOT EXISTS idx_category_products_product_id ON category_products(product_id);
