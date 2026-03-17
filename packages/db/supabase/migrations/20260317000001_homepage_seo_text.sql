-- M012 S01: Add homepage_seo_text column to sites table
ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_seo_text text;
