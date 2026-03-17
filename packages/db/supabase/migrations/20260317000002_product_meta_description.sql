-- M012 S01: Add meta_description column to tsa_products table
ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS meta_description text;
