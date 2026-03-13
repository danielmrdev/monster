-- Migration 004: SEO scoring tables.
-- Applies: seo_scores.
-- Populated by packages/seo-scorer after each site build.

-- ---------------------------------------------------------------------------
-- seo_scores — per-page SEO audit results from seo-scorer package
-- Scores are integers 0-100. Grade is a letter (A, B, C, D, F).
-- factors/suggestions are jsonb arrays for flexible sub-score breakdown.
-- build_id correlates scores to a specific deployment build.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seo_scores (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                 uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_path               text        NOT NULL,
  page_type               text,               -- 'homepage'|'category'|'product'|'legal'
  overall_score           int,
  grade                   text,               -- 'A'|'B'|'C'|'D'|'F'
  content_quality_score   int,
  meta_elements_score     int,
  structure_score         int,
  links_score             int,
  media_score             int,
  schema_score            int,
  technical_score         int,
  social_score            int,
  factors                 jsonb,              -- [{name, score, weight, details}]
  suggestions             jsonb,              -- [{priority, message, action}]
  build_id                text,               -- correlates to deployments.build_id
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seo_scores ENABLE ROW LEVEL SECURITY;

-- Indexes — primary query pattern: look up scores for a site+page
CREATE INDEX IF NOT EXISTS idx_seo_scores_site_id   ON seo_scores(site_id);
CREATE INDEX IF NOT EXISTS idx_seo_scores_site_page ON seo_scores(site_id, page_path);
CREATE INDEX IF NOT EXISTS idx_seo_scores_build_id  ON seo_scores(build_id);
