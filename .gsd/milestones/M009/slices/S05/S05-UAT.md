# S05 UAT — SEO Files + Search Engine Ping

**When to run:** After generating a site (so dist/ exists).

---

## Test 1: SEO files present in generated site dist/

1. Generate a site (click "Generate Site" on any site with categories + products)
2. SSH to VPS1 and check the generated dist:
   ```
   ls apps/generator/.generated-sites/<site-slug>/dist/
   ```
3. **Expected:** `sitemap.xml`, `robots.txt`, `llm.txt`, `buildermonster.txt` are present
4. Check sitemap.xml content:
   ```
   cat apps/generator/.generated-sites/<site-slug>/dist/sitemap.xml
   ```
5. **Expected:** All page URLs listed with `<loc>https://<domain>/...</loc>` entries
6. **Pass if:** All 4 files exist and sitemap has page URLs

---

## Test 2: robots.txt content

1. Open `dist/robots.txt`
2. **Expected:**
   ```
   User-agent: *
   Allow: /
   
   Sitemap: https://<domain>/sitemap.xml
   ```
3. **Pass if:** Content matches format and domain is correct

---

## Test 3: llm.txt content

1. Open `dist/llm.txt`
2. **Expected:** Contains site name, niche, language, list of main URLs
3. **Pass if:** File is human-readable and references the correct domain

---

## Test 4: IndexNow ping after deploy

1. Deploy a site
2. Check the monster-worker logs:
   ```
   pm2 logs monster-worker --lines 50
   ```
3. **Expected:** Log line: `[IndexNow] ping sent for <domain> — status 200` (or 202)
   OR: `[IndexNow] ping for <domain> returned 400 — non-fatal` (400 = key not yet verified, normal on first deploy)
4. **Expected:** Deploy completes normally even if ping returns non-200
5. **Pass if:** Log shows IndexNow was attempted; deploy didn't fail due to ping
