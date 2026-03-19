-- M: Add homepage_meta_description and homepage_intro to sites
-- homepage_meta_description: <meta name="description"> for the homepage (155 chars max)
-- homepage_intro: short intro paragraph shown below H1, before the category grid
ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_meta_description text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_intro text;
