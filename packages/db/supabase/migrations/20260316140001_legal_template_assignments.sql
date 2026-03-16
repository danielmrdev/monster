-- legal_template_assignments: assigns a template per legal type per site
-- UNIQUE (site_id, template_type) ensures one active template per slot per site.

CREATE TABLE IF NOT EXISTS legal_template_assignments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  template_type  text        NOT NULL CHECK (template_type IN ('privacy', 'terms', 'cookies', 'contact')),
  template_id    uuid        NOT NULL REFERENCES legal_templates(id) ON DELETE CASCADE,
  UNIQUE (site_id, template_type)
);

ALTER TABLE legal_template_assignments ENABLE ROW LEVEL SECURITY;
