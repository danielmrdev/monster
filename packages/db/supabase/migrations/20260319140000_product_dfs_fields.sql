-- Enrich tsa_products with additional DataForSEO fields captured at search time.
-- All columns nullable — products imported before this migration have NULL values.

ALTER TABLE tsa_products
  ADD COLUMN IF NOT EXISTS is_amazon_choice  boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS bought_past_month integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS special_offers    text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rank_position     integer     DEFAULT NULL;

COMMENT ON COLUMN tsa_products.is_amazon_choice  IS 'Amazon Choice badge from DataForSEO search result';
COMMENT ON COLUMN tsa_products.bought_past_month IS 'Estimated units bought in the past month (Amazon-reported). Null if not available.';
COMMENT ON COLUMN tsa_products.special_offers    IS 'Active promotions/coupons at import time, e.g. ["Ahorra 10 € con un cupón"]';
COMMENT ON COLUMN tsa_products.rank_position     IS '1-based organic rank position in DataForSEO search result. Lower = more prominent.';
