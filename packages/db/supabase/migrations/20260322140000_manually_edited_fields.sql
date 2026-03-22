-- Track which SEO fields were manually edited (vs AI-generated)
ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS manually_edited_fields text[] DEFAULT '{}';
ALTER TABLE tsa_categories ADD COLUMN IF NOT EXISTS manually_edited_fields text[] DEFAULT '{}';
