# S05: SEO Files + Search Engine Ping

**Goal:** Every generated site dist contains sitemap.xml, robots.txt, and llm.txt; deploying a site pings Google and Bing IndexNow.
**Demo:** After generating a site, the dist/ directory contains sitemap.xml with all page URLs, robots.txt pointing to the sitemap, and llm.txt describing the site. After deploying, logs show IndexNow pings sent to Google and Bing.

## Must-Haves

- `writeSeoFiles(distDir, siteData)` function writes sitemap.xml, robots.txt, llm.txt after astro build
- SEO files phase wired into GenerateSiteJob after score_pages, before deploy
- `pingIndexNow(domain, urls[])` function sends IndexNow ping to indexnow.org (covers Google + Bing)
- IndexNow ping called from runDeployPhase after successful dns_pending transition
- All three files present in a test build of a site
- Build + typecheck pass

## Proof Level

- This slice proves: contract (files in dist) + integration (ping function callable)
- Real runtime required: yes for SEO files (dist must contain them); IndexNow ping verified by logs
- Human/UAT required: yes (check dist/ after generation; check logs after deploy)

## Verification

- `pnpm --filter @monster/agents build` exits 0
- SEO file functions exist: `grep -r writeSeoFiles packages/agents/src` finds the function
- `grep -r pingIndexNow packages/agents/src` finds the function and its call in deploy-site.ts

## Tasks

- [x] **T01: writeSeoFiles helper + GenerateSiteJob wiring** `est:45m`
  - Why: sitemap.xml, robots.txt, llm.txt are SEO necessities; written post-build to dist/
  - Files: `packages/agents/src/seo-files.ts` (new), `packages/agents/src/jobs/generate-site.ts`
  - Do:
    (1) Create `packages/agents/src/seo-files.ts`:
      - `writeSeoFiles(distDir, siteInfo, pages)` function (non-async, all sync writes):
        - `siteInfo`: `{ domain, name, niche, language }`
        - `pages`: string[] of relative URLs (e.g. ['/', '/categories/air-fryers', '/products/b08f...'])
        - Writes `sitemap.xml`: `<?xml ...><urlset xmlns="...">${pages.map(p => `<url><loc>https://${domain}${p}</loc><changefreq>weekly</changefreq><priority>${p==='/'?'1.0':'0.8'}</priority></url>`).join('')}</urlset>`
        - Writes `robots.txt`: `User-agent: *\nAllow: /\nSitemap: https://${domain}/sitemap.xml\n`
        - Writes `llm.txt`: frontmatter-style file with site name, niche, language, description, and main URLs
    (2) In `generate-site.ts`, after the `score_pages` phase and BEFORE the deploy phase:
        - Collect all page relative URLs from the built dist/ HTML files (already enumerated for score_pages)
        - Call `writeSeoFiles(distDir, { domain, name, niche, language }, urlList)`
        - Update ai_jobs phase to 'seo_files' while running
        - Log results; non-fatal if files fail (log warning, continue to deploy)
  - Verify: `pnpm --filter @monster/agents build` exits 0; seo-files.ts exists
  - Done when: Build clean; writeSeoFiles exported from the module

- [x] **T02: pingIndexNow + deploy-site.ts wiring** `est:30m`
  - Why: Pinging IndexNow after deploy accelerates search engine crawling
  - Files: `packages/agents/src/index-now.ts` (new), `packages/agents/src/jobs/deploy-site.ts`
  - Do:
    (1) Create `packages/agents/src/index-now.ts`:
      - `pingIndexNow(domain)` async function:
        - Constructs the IndexNow URL: `https://api.indexnow.org/indexnow?url=https://${domain}/&key=${key}`
        - Uses a fixed key (a well-known public test key or generates a stable one from the domain)
        - Actually: IndexNow requires a key file at `domain/key.txt`. For simplicity use the domain hash as key and write a `{key}.txt` file to dist/ — but this requires knowing the key at build time.
        - Simpler approach: Use the IndexNow API with a fixed key '00000000000000000000000000000001' (a test key for testing) OR just POST to the submitURL endpoint. Actually the simplest valid approach: POST to `https://api.indexnow.org/indexnow` with body `{ host: domain, key: <key>, urlList: [<homepage>] }`. The key must match a `${key}.txt` file at the root of the site. Write the key file to dist/ in writeSeoFiles.
        - Decision: generate a deterministic key from domain (SHA-256 first 32 hex chars of domain), write `${key}.txt` to dist in writeSeoFiles, ping after deploy.
        - Actually simplest valid approach: use a static key string stored as a constant (e.g. 'buildermonster') written to `buildermonster.txt` at site root. Ping via GET: `https://www.bing.com/indexnow?url=https://${domain}&key=buildermonster`. IndexNow GET format is also supported.
        - Use GET approach: `fetch(`https://api.indexnow.org/indexnow?url=https://${domain}/&key=buildermonster`)` — non-fatal if it fails (log warning, don't throw)
    (2) Add `buildermonster.txt` to dist/ in writeSeoFiles (content: `buildermonster`)
    (3) In deploy-site.ts `runDeployPhase`, after the `dns_pending` transition and before the SslPollerJob enqueue, call `await pingIndexNow(domain)` — non-fatal (try/catch, log warning on failure)
  - Verify: `pnpm --filter @monster/agents build` exits 0; pingIndexNow function exists in index-now.ts; call present in deploy-site.ts
  - Done when: Build clean; deploy-site.ts calls pingIndexNow

## Files Likely Touched

- `packages/agents/src/seo-files.ts` (new)
- `packages/agents/src/index-now.ts` (new)
- `packages/agents/src/jobs/generate-site.ts`
- `packages/agents/src/jobs/deploy-site.ts`
