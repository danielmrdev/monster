-- Add status column to track async search lifecycle
ALTER TABLE dfs_search_cache
  ADD COLUMN status text NOT NULL DEFAULT 'complete',
  ADD COLUMN site_id uuid REFERENCES sites(id);

-- Add proper unique constraint for upsert support (application always normalizes
-- keyword to lowercase and market to uppercase before insert)
ALTER TABLE dfs_search_cache
  ADD CONSTRAINT dfs_search_cache_keyword_market_uq UNIQUE (keyword, market);

-- Enable Realtime for this table (with FULL replica identity so old row is available)
ALTER TABLE dfs_search_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE dfs_search_cache;

-- RLS: allow anon key SELECT for Realtime subscriptions from browser
ALTER TABLE dfs_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON dfs_search_cache FOR SELECT USING (true);

COMMENT ON COLUMN dfs_search_cache.status IS
  'Search status: pending (task_post sent, awaiting postback), complete (results received)';
COMMENT ON COLUMN dfs_search_cache.site_id IS
  'Site that initiated the search (for notifications). NULL for legacy cached entries.';
