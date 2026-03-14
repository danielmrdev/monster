-- Add unique constraint to seo_scores for idempotent upserts on rebuild.
-- Required by packages/agents score_pages phase (.upsert with onConflict).
ALTER TABLE seo_scores
  ADD CONSTRAINT seo_scores_site_page_unique UNIQUE (site_id, page_path);
