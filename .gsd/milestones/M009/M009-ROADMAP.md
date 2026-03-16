# M009: UX Polish + Capabilities Upgrade

**Vision:** Fix the friction points accumulated after M001–M008, add critical SEO infrastructure, bring in a cost-saving Amazon scraper, enable AI-assisted content editing everywhere, and introduce the global context-aware chat sidebar.

## Success Criteria

- Generate Site button shows loading state immediately on click and reflects live job status (pending/running/completed/failed)
- Preview link in site detail has no spurious "/" prefix
- Chat responses render markdown (bold, headers, lists, code blocks)
- Chat appears as a collapsible right sidebar on all dashboard pages with current page context
- "Generate with AI" button in CategoryForm and ProductForm produces SEO text via AI with site/category context
- System prompts for all agents are editable in Settings and stored in DB
- Product search uses Amazon scraper (free); adding a product still enriches via DFS ASIN lookup
- Every generated site dist contains sitemap.xml, robots.txt, llm.txt
- Deploying a site pings Google + Bing IndexNow
- Legal templates section: create/edit/delete templates; assign per site per type; templates render in generated sites
- Dashboard shows failed job alerts, open product alerts, top 5 sites by pageviews, P&L summary
- claude_api_key removed from Settings

## Key Risks / Unknowns

- Amazon scraper blocked by anti-bot: Amazon may detect Node.js fetch even with UA rotation — cheerio parsing may break on HTML structure changes
- Chat sidebar layout: collapsible panel needs to work without breaking existing scroll/overflow behavior in the dashboard layout
- Legal templates in Astro: current legal pages have hardcoded content — need to wire site.json template data through without breaking existing generated sites that have no assigned templates (graceful fallback)

## Proof Strategy

- Amazon scraper blocked → retire in S04 by getting real search results from amazon.es for a test keyword in the admin panel
- Chat sidebar layout → retire in S03 by verifying sidebar opens/closes correctly on /dashboard and /sites pages without layout breaks
- Legal templates Astro wiring → retire in S06 by generating a test site with assigned templates and verifying the legal page content matches the template

## Verification Classes

- Contract verification: build + typecheck exit 0 after each slice; DB migrations apply cleanly
- Integration verification: Generate Site polling shows real ai_jobs status; scraper returns real Amazon products; SEO files present in dist; legal page content matches assigned template in built site
- Operational verification: pm2 reload passes after each slice; no regressions in existing generate/deploy pipeline
- UAT / human verification: chat sidebar feel and context accuracy; SEO text AI generation quality; legal template editing UX

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 7 slices delivered and verified
- Build + typecheck pass across monorepo
- pm2 reload of monster-admin and monster-worker succeeds
- Generate Site button shows live job status
- Chat sidebar opens from at least /dashboard and /sites with page context visible in requests
- Amazon scraper returns real results for a test keyword
- Generated site dist contains sitemap.xml, robots.txt, llm.txt
- Legal template assigned to a site renders correctly in generated Astro output
- Dashboard shows failed job alerts and P&L summary

## Requirement Coverage

- Covers: R016, R017, R018, R019, R020, R021, R022, R023, R024, R025, R026, R027
- Partially covers: R001 (SEO files + legal templates strengthen the generation pipeline)
- Leaves for later: R006 (deploy improvements), R007 (product refresh)
- Orphan risks: none

## Slices

- [ ] **S01: UX Fixes + Dashboard Enhancements** `risk:low` `depends:[]`
  > After this: Generate Site button shows loading + job status polling; Preview link fixed; chat renders markdown; claude_api_key removed from Settings; Dashboard shows failed jobs, open alerts, and P&L summary widget.

- [ ] **S02: AI SEO Generation + Prompt Editor** `risk:medium` `depends:[S01]`
  > After this: "Generate with AI" button in CategoryForm and ProductForm calls a new API route and streams AI-generated SEO text with site/category context; System prompts editable in Settings and stored in DB.

- [ ] **S03: Global Chat Sidebar** `risk:medium` `depends:[S01]`
  > After this: Chat panel slides in from the right on any dashboard page; toggle button in nav; page context (current route label) sent with every message; /monster page unchanged for conversation history.

- [ ] **S04: Amazon Product Scraper** `risk:medium` `depends:[]`
  > After this: Product search uses Amazon scraper (cheerio + Node fetch); real product results appear in the search UI; DFS ASIN lookup still called when adding a selected product.

- [ ] **S05: SEO Files + Search Engine Ping** `risk:low` `depends:[]`
  > After this: Generated site dist contains sitemap.xml, robots.txt, llm.txt; deploying a site sends IndexNow ping to Google and Bing.

- [ ] **S06: Legal Page Templates** `risk:medium` `depends:[]`
  > After this: /templates section in nav with CRUD for legal templates (privacy, terms, cookies, contact); templates assignable per site; assigned templates render in Astro-generated legal pages with graceful fallback to defaults.

- [ ] **S07: Integration + Polish** `risk:low` `depends:[S01,S02,S03,S04,S05,S06]`
  > After this: Full milestone verified end-to-end; build clean; pm2 reload passes; all S01–S06 must-haves re-checked together.

## Boundary Map

### S01 → S02
Produces:
- Dashboard layout unchanged (no structural changes that would conflict with S02 work)
- Settings page with claude_api_key removed — S02 adds prompt editor section on top of this

Consumes:
- nothing (first slice, brownfield fixes only)

### S01 → S03
Produces:
- dashboard/layout.tsx untouched structurally — S03 modifies it to add the sidebar column

Consumes:
- nothing

### S02 → S07
Produces:
- `POST /api/sites/[id]/generate-seo-text` — accepts `{ field: 'category_seo_text' | 'product_description', contextId: string }`, streams AI text tokens as SSE
- `agent_prompts` DB table — columns: id, agent_key (string), prompt_type ('system'), content (text), updated_at
- `getAgentPrompt(agentKey)` — reads override from DB, falls back to hardcoded default

Consumes:
- S01: nothing structural (parallel-safe)

### S03 → S07
Produces:
- `ChatSidebar` client component — accepts `pageContext: string`; reuses /api/monster/chat route
- Toggle button in NavSidebar
- `chat-sidebar-open` localStorage key for persistence
- Dashboard layout updated: `flex h-screen` with conditional right panel

Consumes:
- S01: layout.tsx must not have breaking structural changes (it won't — S01 is brownfield fixes)

### S04 → S07
Produces:
- `packages/agents/src/clients/amazon-scraper.ts` — `AmazonScraper.search(keyword, market)` returns `ScrapedProduct[]`
- `ScrapedProduct` type: `{ asin, title, price, rating, imageUrl, url }`
- Updated `POST /api/sites/[id]/product-search` — uses AmazonScraper instead of DataForSEOClient

Consumes:
- nothing (parallel-safe)

### S05 → S07
Produces:
- `writeSeoFiles(distDir, siteData)` helper — writes sitemap.xml, robots.txt, llm.txt to dist/
- SEO files phase added to GenerateSiteJob after `build` phase
- `pingIndexNow(domain)` helper — pings Google + Bing IndexNow
- IndexNow ping added to deploy-site.ts runDeployPhase() after successful Caddy + DNS

Consumes:
- nothing (parallel-safe)

### S06 → S07
Produces:
- `legal_templates` DB table: id, title, type ('privacy'|'terms'|'cookies'|'contact'), language, content (markdown text), created_at, updated_at
- `legal_template_assignments` DB table: id, site_id, template_type, template_id (FK)
- `/templates` Next.js route group with list + create/edit/delete pages
- `Templates` nav item in NavSidebar
- site.json `legalTemplates` field: `{ privacy?: string, terms?: string, cookies?: string, contact?: string }` (markdown content, null = use default)
- Astro `[legal].astro` reads `legalTemplates[pageType]` from site.json; falls back to hardcoded default if null

Consumes:
- nothing (parallel-safe)

### S01–S06 → S07
Produces:
- Verified working system across all slices
- Clean build + typecheck
- pm2 reload confirmed

Consumes from all upstream slices:
- All produce/consume contracts above
