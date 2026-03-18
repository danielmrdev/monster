-- M013: Add site_type_slug FK to site_templates + clean up old slugs

ALTER TABLE site_templates
  ADD COLUMN IF NOT EXISTS site_type_slug text REFERENCES site_types(slug);

-- Populate for all existing rows
UPDATE site_templates SET site_type_slug = 'tsa'
WHERE slug IN ('classic', 'modern', 'minimal', 'tsa/classic', 'tsa/modern', 'tsa/minimal');

-- Migrate any sites still on bare slugs (guard against 20260317000003 not having run)
UPDATE sites SET template_slug = 'tsa/' || template_slug
WHERE template_slug IN ('classic', 'modern', 'minimal');

-- Now safe to remove the bare-slug rows
DELETE FROM site_templates WHERE slug IN ('classic', 'modern', 'minimal');

-- Remove tsa/modern and tsa/minimal only if no sites reference them (M013: one template)
DELETE FROM site_templates
WHERE slug IN ('tsa/modern', 'tsa/minimal')
  AND NOT EXISTS (SELECT 1 FROM sites WHERE sites.template_slug = site_templates.slug);
