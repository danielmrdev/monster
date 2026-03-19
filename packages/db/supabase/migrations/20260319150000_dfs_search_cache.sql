-- Cache for DataForSEO Merchant API search results.
-- Keyed by (keyword, market) — global across sites, same market = same results.
-- `depth` tracks how many results were fetched; a cache hit is valid only when
-- cached depth >= requested depth.
-- TTL: 7 days (enforced at application layer via `expires_at`).

CREATE TABLE dfs_search_cache (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword     text        NOT NULL,
  market      text        NOT NULL,
  depth       integer     NOT NULL DEFAULT 100,
  results     jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE UNIQUE INDEX dfs_search_cache_keyword_market_idx
  ON dfs_search_cache (lower(keyword), upper(market));

COMMENT ON TABLE dfs_search_cache IS
  'Cache of DataForSEO Amazon Merchant API search results. TTL 7 days. Global by keyword+market.';
