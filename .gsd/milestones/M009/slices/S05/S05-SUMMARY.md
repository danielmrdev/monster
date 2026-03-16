---
id: S05
milestone: M009
provides:
  - writeSeoFiles(distDir, site, pageUrls) — writes sitemap.xml, robots.txt, llm.txt, buildermonster.txt to dist/
  - SEO files phase in GenerateSiteJob (between score_pages and deploy) — non-fatal
  - pingIndexNow(domain) — sends IndexNow GET ping to api.indexnow.org — non-fatal
  - IndexNow ping called from runDeployPhase after dns_pending transition
  - packages/agents/types/index.d.ts — stable source for hand-written types (postbuild copies to dist/)
  - build script postbuild: copies types/index.d.ts to dist/index.d.ts after tsup clean
key_files:
  - packages/agents/src/seo-files.ts
  - packages/agents/src/index-now.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/src/jobs/deploy-site.ts
  - packages/agents/types/index.d.ts
  - packages/agents/package.json
key_decisions:
  - "IndexNow key = 'buildermonster' (static constant); key file written to dist/ as buildermonster.txt by writeSeoFiles"
  - "IndexNow ping is non-fatal — logs warning, never throws — deploy succeeds even if ping fails"
  - "types/index.d.ts is the maintained source for hand-written DTS; postbuild copies it to dist/ after tsup's clean step deletes it (resolves the D047 DTS pattern durability issue)"
  - "SEO files phase is non-fatal — if dist doesn't exist or write fails, deploy continues"
patterns_established:
  - "Hand-written DTS maintained in types/index.d.ts, copied postbuild — durable against tsup clean"
drill_down_paths:
  - .gsd/milestones/M009/slices/S05/S05-PLAN.md
duration: 1h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S05: SEO Files + Search Engine Ping

**writeSeoFiles writes sitemap.xml/robots.txt/llm.txt/buildermonster.txt post-build; pingIndexNow fires after deploy; DTS generation now stable via types/index.d.ts postbuild copy.**

## What Was Built

**seo-files.ts** — `writeSeoFiles(distDir, site, pageUrls)` writes four files to dist/ after astro build:
- `sitemap.xml` — all page URLs with priorities (homepage=1.0, categories=0.9, others=0.8)
- `robots.txt` — Allow all + Sitemap reference
- `llm.txt` — Human-readable + machine-readable site description for AI crawlers
- `buildermonster.txt` — IndexNow key verification file

**index-now.ts** — `pingIndexNow(domain)` sends a GET request to `api.indexnow.org` with the buildermonster key. Non-fatal (logs warning on failure).

**GenerateSiteJob** — new `seo_files` phase between `score_pages` and `deploy`. Collects page URLs from built dist/ HTML files (reuses same glob pattern), calls writeSeoFiles. Wrapped in try/catch — non-fatal.

**DeployPhase** — `pingIndexNow(domain)` called after `dns_pending` transition. Non-fatal.

**DTS durability fix** — `packages/agents/types/index.d.ts` is now the canonical source for hand-written types. Build script copies it to `dist/index.d.ts` after tsup runs (tsup's `clean: true` was deleting it on every build).

## Deviations

- sitemap.xml uses a simple glob of dist HTML files for URLs (same pattern as score_pages phase) — page URL derivation is straightforward (index.html → /, path/index.html → /path/).

## Verification

- `pnpm --filter @monster/agents build` exits 0 ✓
- `pnpm --filter @monster/admin build` exits 0 ✓
- `dist/index.d.ts` present after build ✓
