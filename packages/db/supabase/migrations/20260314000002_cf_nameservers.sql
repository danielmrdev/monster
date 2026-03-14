-- M004/S02: add cf_nameservers array to domains table for Cloudflare NS display
ALTER TABLE domains ADD COLUMN IF NOT EXISTS cf_nameservers text[] DEFAULT '{}';
