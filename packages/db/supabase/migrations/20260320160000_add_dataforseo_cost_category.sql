-- Migration: Add 'dataforseo' to cost_categories
-- Allows costs table to track DataForSEO API call costs (D134: $0.006/call).
-- Idempotent via ON CONFLICT (slug) DO NOTHING.

INSERT INTO cost_categories (slug, name) VALUES
  ('dataforseo', 'DataForSEO API')
ON CONFLICT (slug) DO NOTHING;
