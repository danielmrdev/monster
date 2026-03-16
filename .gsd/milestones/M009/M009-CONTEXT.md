# M009: UX Polish + Capabilities Upgrade

**Gathered:** 2026-03-16
**Status:** Ready for planning

## Project Description

BuilderMonster is a self-operated admin panel for managing a TSA Amazon affiliate site portfolio. M001–M008 are complete. This milestone addresses a batch of UX bugs, missing capabilities, and product improvements surfaced after validating the core pipeline.

## Why This Milestone

The core pipeline (generate → deploy → refresh) works. This milestone makes it usable at scale: fixes friction points that slow the operator down daily, adds critical SEO infrastructure (sitemap, robots.txt, llm.txt), brings in a cost-saving Amazon scraper for product search, enables AI-assisted content editing, and introduces the global chat sidebar for context-aware assistance everywhere.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Click "Generate Site" and immediately see a loading indicator with live status — no more silent form submission
- View a site preview without a spurious "/" in the button label
- Use the chat sidebar from any page without navigating to /monster, with the assistant knowing what page they're on
- Click "Generate with AI" next to any SEO text field to produce AI content with full category/site context
- Edit the system prompts used by all agents from the Settings page
- Search for Amazon products using the scraper (free) instead of DataForSEO, then enrich via ASIN lookup (DFS) only when adding to the site
- See sitemap.xml, robots.txt, and llm.txt on every generated site
- Have Google/Bing pinged automatically when a site deploys
- Browse, create, and assign legal page templates (privacy, terms, cookies, contact) to sites per type
- See alerts, site stats, and a financial summary on the Dashboard

### Entry point / environment

- Entry point: `http://monster-admin:3004` (VPS1 via Tailscale) — Next.js admin panel
- Environment: local VPS + Supabase Cloud + BullMQ + Astro generator
- Live dependencies: Supabase, Upstash Redis, Claude Agent SDK (no API key), DataForSEO (ASIN lookup only)

## Completion Class

- Contract complete means: build + typecheck pass, components render correctly, DB migrations applied
- Integration complete means: Generate Site button shows real job status; chat sidebar streams correctly from all pages; Amazon scraper returns real results; SEO files present in generated site dist; legal templates render in generated sites
- Operational complete means: pm2 reload passes; site generation with SEO files + legal pages builds without errors

## Final Integrated Acceptance

- Generate Site button shows loading state immediately on click and reflects job completion/failure
- Chat sidebar opens from /dashboard and /sites and the system prompt includes current page context
- Search products by keyword using scraper → add product → ASIN lookup enriches data
- Generated site dist contains sitemap.xml, robots.txt, llm.txt
- Legal template assigned to a site renders in the generated site for privacy/terms/cookies/contact pages

## Risks and Unknowns

- Amazon scraper: Amazon anti-bot measures may block Node.js fetch even with User-Agent spoofing — port carefully from PHP pattern — risk:medium
- Chat sidebar as global panel: layout.tsx needs a state mechanism for the toggle that works across server/client boundary — shadcn Sheet or custom drawer — risk:medium
- Page context in chat: client component with `usePathname()` passes current route to the API request — risk:low
- System prompt editor: prompts currently hardcoded in agent files; need a DB-backed override pattern — risk:low
- Legal templates in generator: Astro legal pages currently hardcoded; need to read template markdown from site.json — risk:medium

## Existing Codebase / Prior Art

- `apps/admin/src/app/(dashboard)/layout.tsx` — two-column layout (NavSidebar + main); sidebar will be a third overlay
- `apps/admin/src/components/nav-sidebar.tsx` — client component with usePathname; toggle button for sidebar goes here
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — streaming chat client component; reusable as sidebar
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — full-page chat; remains as conversation history view
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx` — SEO text textarea; needs AI generate button
- `apps/admin/src/app/(dashboard)/settings/page.tsx` + `constants.ts` — settings CRUD; claude_api_key to be removed; prompt editor added here
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — minimal 4-KPI grid; expand with alerts + finances
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate Site form action (no feedback); Preview link (has extra slash)
- `packages/agents/src/jobs/generate-site.ts` — job phases pattern; SEO files phase goes here after astro build
- `packages/agents/src/clients/dataforseo.ts` — DataForSEOClient; ASIN lookup stays, search replaced by scraper
- `apps/admin/src/app/api/sites/[id]/product-search/route.ts` — product search route; switch to scraper
- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductSearch.tsx` — product search UI
- `danielmrdev/tsa-monster` `app/Services/AmazonScraperService.php` — working PHP scraper pattern to port
- `apps/generator/src/pages/` — Astro legal pages; need to read template from site.json
- `packages/db/supabase/migrations/` — migrations for: agent_prompts, legal_templates, legal_template_assignments

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R016 — Generate Site button feedback
- R017 — Affiliate tag per-site (already in DB; confirm global Settings field removal)
- R018 — AI SEO text generation in category/product forms
- R019 — Chat markdown rendering
- R020 — Chat as global side panel with page context
- R021 — System prompt editor in Settings
- R022 — Amazon scraper for product search (free); DFS for ASIN enrich only
- R023 — SEO files (sitemap.xml, robots.txt, llm.txt) per site
- R024 — Search engine ping on deploy (IndexNow)
- R025 — Legal page templates (multi-lang, editable, assignable per site)
- R026 — Dashboard: failed job alerts, site stats, P&L summary
- R027 — Auth via claude-agent-sdk only (remove claude_api_key from Settings)

## Scope

### In Scope

- Generate Site button loading state + polling via ai_jobs table (client component or optimistic UI)
- Preview link: remove extra slash bug
- Chat markdown rendering (react-markdown or remark)
- Remove claude_api_key from SETTINGS_KEYS and settings form
- Global chat sidebar: collapsible right panel in dashboard layout, page context via usePathname
- AI SEO text generation button in CategoryForm and ProductForm
- New API route: POST /api/sites/[id]/generate-seo-text (streams AI response with category/site context)
- System prompt editor in Settings: agent_prompts table in DB; override per agent key
- Amazon scraper in packages/agents/src/clients/amazon-scraper.ts (cheerio, Node fetch)
- Replace /api/sites/[id]/product-search route to use scraper instead of DFS
- DFS ASIN lookup route unchanged
- SEO files phase in GenerateSiteJob: write sitemap.xml, robots.txt, llm.txt to dist after astro build
- Search engine ping from deploy phase: IndexNow API for Google + Bing
- New /templates nav section: CRUD for legal_templates; assign per site per type
- legal_template_assignments table: site_id + template_type + template_id
- Legal templates rendered in Astro generator: site.json includes assigned templates per type
- Dashboard: recent failed jobs, open alerts list, top 5 sites by pageviews, P&L widget (total revenue - total costs)

### Out of Scope / Non-Goals

- VPS provisioning (M010)
- New site types
- Template visual preview / WYSIWYG editor (plain markdown textarea is sufficient)
- Background pre-generation of SEO files

## Technical Constraints

- claude-agent-sdk: SDK reads credentials from system (claude CLI OAuth token); NO API key in settings
- Amazon scraper: Node.js + cheerio; no Puppeteer/Playwright (too heavy for VPS1); rotate user agents
- Legal templates: stored as markdown text in DB; rendered to HTML at Astro build time
- SEO files written after astro build() completes — directly to the dist directory
- Chat sidebar toggle state in localStorage (persists across navigation without server round-trip)
- agent_prompts table: columns (id, agent_key, prompt_type [system|user], content, updated_at); read at job start time

## Integration Points

- Supabase — new tables: agent_prompts, legal_templates, legal_template_assignments
- Claude Agent SDK — chat sidebar reuses /api/monster/chat; SEO text generation uses same SDK client
- DataForSEO — ASIN lookup unchanged; search replaced
- Astro generator — SEO files written post-build; legal template markdown in site.json
- IndexNow API — Google + Bing ping from deploy-site.ts after successful deploy

## Open Questions

- Amazon scraper HTML parser: cheerio vs node-html-parser → cheerio (parity with PHP DomCrawler, battle-tested)
- Legal templates storage format: markdown vs HTML → markdown (safer for editing; convert at render time in Astro)
- Sitemap generation: static from site.json known pages → yes, all pages known at Astro build time
