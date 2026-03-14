-- Migration 005 (2026-03-14): Add source_image_url column to tsa_products.
-- Nullable text — stores the original Amazon CDN URL before download/optimization.
-- Written by GenerateSiteJob during product upsert; used by diff engine to detect
-- image changes across refresh cycles.

ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS source_image_url text;
