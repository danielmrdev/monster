-- legal_templates: user-editable legal page content templates
-- One template = one legal page type in one language.
-- Multiple templates per type allowed (e.g. ES privacy, EN privacy).

CREATE TABLE IF NOT EXISTS legal_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  type        text        NOT NULL CHECK (type IN ('privacy', 'terms', 'cookies', 'contact')),
  language    text        NOT NULL DEFAULT 'es',
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legal_templates ENABLE ROW LEVEL SECURITY;
