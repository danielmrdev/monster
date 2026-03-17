-- M012 S01: Namespace template slugs to tsa/* for multi-site-type extensibility
-- Insert tsa-namespaced template rows (idempotent)
INSERT INTO site_templates (slug, name, description) VALUES
  ('tsa/classic', 'Classic', 'Traditional grid layout with sidebar'),
  ('tsa/modern',  'Modern',  'Full-width clean layout with card grid'),
  ('tsa/minimal', 'Minimal', 'Lightweight single-column layout')
ON CONFLICT (slug) DO NOTHING;

-- Migrate existing sites from bare slugs to tsa/* namespace
UPDATE sites
SET template_slug = 'tsa/' || template_slug
WHERE template_slug IN ('classic', 'modern', 'minimal');
