# Requirements

This file is the explicit capability and coverage contract for BuilderMonster.

## Active

### R001 — End-to-end site generation pipeline
- Class: primary-user-loop
- Status: active
- Description: User can go from niche idea to a fully generated, deployed, publicly accessible TSA site with AI-written content and SEO-optimized pages in under 30 minutes.
- Why it matters: This is the core value loop. Everything else is scaffolding for this.
- Source: user
- Primary owning slice: M003/S02
- Supporting slices: M002/S01, M003/S01, M004/S01
- Validation: unmapped
- Notes: Phase 1 gate requires pipeline < 30 min end-to-end

### R002 — Extensible site type architecture
- Class: constraint
- Status: active
- Description: The DB schema, generator pipeline, content generation, and admin panel must support multiple site types (TSA, AdSense blog, multi-affiliate, etc.) without structural rewrites. Phase 1 implements TSA only.
- Why it matters: The whole business model depends on diversifying site types in later phases. Painting into a corner now costs months.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M003/S01, M007/S01
- Validation: unmapped
- Notes: Enforced by schema design: shared `sites` table + type-specific tables. Validated when second site type is added in M008+.

### R003 — Autonomous niche research
- Class: primary-user-loop
- Status: active
- Description: User inputs a niche idea; NicheResearcher agent autonomously analyzes competition, keywords, Amazon product availability, and domain options, producing an actionable viability report.
- Why it matters: Research quality determines site quality. Manual research takes days; agent does it in minutes.
- Source: user
- Primary owning slice: M007/S02
- Supporting slices: M007/S01
- Validation: M007/S02 — NicheResearcherJob implemented (BullMQ, lockDuration 600s, maxTurns 15); createNicheResearcherMcpServer with 5 tools (keywordIdeas, serpCompetitors, googleSerpResults, amazonProducts, checkDomainAvailability); per-turn progress writes to research_sessions.progress jsonb; ResearchReportSchema Zod validation; structurally valid report produced from manual enqueue (12 turns, all 10 schema fields present); job survives worker restart; Research Lab UI with 5s polling confirmed via build + code review. Final validation proof (real DataForSEO keyword data in report) requires human UAT with DFS credentials configured in Settings.

### R004 — AI content generation (batch, SEO-optimized)
- Class: primary-user-loop
- Status: validated
- Description: ContentGenerator produces category SEO texts (~400 words), product descriptions, pros/cons, user opinion summaries, meta descriptions — all in the site's language, optimized for conversion and ranking.
- Why it matters: Content quality and volume is the primary SEO lever. Manual content at 50+ products/site is not viable.
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: M003/S01
- Validation: M003/S03 — ContentGenerator implemented with Zod v4 structured outputs, throttle-aware (1.5s pacing + maxRetries:5), idempotent (focus_keyword DB check); pnpm --filter @monster/agents build exit 0; typecheck exit 0; wired into GenerateSiteJob generate_content phase with ai_jobs.payload progress tracking
- Notes: Throttle-aware (Plan Pro). Zod schemas for structured output. Live API run pending DataForSEO + Anthropic credentials in admin Settings.

### R005 — SEO Scorer: automated on-page validation
- Class: quality-attribute
- Status: validated
- Description: Every generated page gets a 0-100 SEO score across 8 categories before deploy. Pages scoring < 70 trigger warnings. Score data persisted in Supabase, visible in site detail view.
- Why it matters: SEO quality is the product. Shipping pages below threshold wastes the site's authority budget.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: M003/S02
- Validation: M003/S04 — scorePage() with 8 weighted categories; 8/8 unit tests pass; score_pages phase wired into GenerateSiteJob; seo_scores unique constraint migration applied; SEO Scores table rendered in admin panel; integration smoke test: freidoras de aire / homepage → score 51 grade C. Operational validation (real seo_scores rows ≥70 on ≥80% of pages) pending first live job run.
- Notes: Research in `docs/research/seo-scoring-research.md`. Focus keyword passed explicitly from DB. Legal page keyword exemptions award full marks (not zero). Admin panel scores table rendered server-side from @monster/db types.

### R006 — Automated deployment to VPS2 via Cloudflare
- Class: operability
- Status: active
- Description: After Astro build, the deployment service rsyncs the site to VPS2, creates/updates the Cloudflare zone + A record, and tracks the site through states: `deploying → dns_pending → ssl_pending → live`.
- Why it matters: Manual deployment doesn't scale to 200+ sites.
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S02
- Validation: unmapped
- Notes: Cloudflare free tier. Spaceship registers domain, NS delegated to Cloudflare.

### R007 — Product refresh pipeline
- Class: continuity
- Status: active
- Description: Cron job (BullMQ) fetches updated product data from DataForSEO, diffs against DB, and triggers conditional Astro rebuild + redeploy only when price/availability/image changes. Rating changes deferred to next cycle.
- Why it matters: Static sites go stale. Outdated prices and unavailable products destroy trust and conversion.
- Source: user
- Primary owning slice: M006/S01
- Supporting slices: M006/S02
- Validation: M006/S01 — ProductRefreshJob fetches DataForSEO products, writes last_refreshed_at, admin panel shows refresh timestamp with Refresh Now button. M006/S02 — diff engine implemented (price/availability/image rebuild-triggering; rating deferred); conditional GenerateSiteJob enqueue when shouldRebuild && site.status=live; 10 unit tests pass; builds + typechecks pass. M006/S03 — admin panel refresh card + per-site alert summary visible. End-to-end runtime proof (live DFS → real DB diff → actual GenerateSiteJob in queue) deferred to human UAT (no live sites yet).

### R008 — Product availability alerts
- Class: failure-visibility
- Status: active
- Description: When products become unavailable, the system creates alerts (product unavailable, category empty, site degraded >30%). Alerts visible in Dashboard. Unavailable products excluded from site.
- Why it matters: Silent degradation kills revenue. User needs to know which sites need attention.
- Source: user
- Primary owning slice: M006/S02
- Supporting slices: M002/S01
- Validation: M006/S02 — alert creation implemented for all three types (unavailable/category_empty/site_degraded) with check-before-insert dedup on (site_id, product_id, alert_type) WHERE status=open; severity column migration applied; builds + typechecks pass. M006/S03 — global /alerts page with acknowledge/resolve actions, per-site SiteAlerts component, dashboard amber KPI card; builds + typechecks pass. Dedup live runtime proof (two consecutive refresh cycles → exactly one open alert) deferred to human UAT (no live sites yet).

### R009 — Analytics: lightweight GDPR-friendly tracking
- Class: primary-user-loop
- Status: active
- Description: Each generated site embeds a ~2KB vanilla JS tracking script. Events (pageview, affiliate click) POST directly to Supabase. No cookies. Country from CF-IPCountry. Language from navigator.language.
- Why it matters: Without traffic data the portfolio is blind. Knowing which pages and sites perform is necessary for every optimization decision.
- Source: user
- Primary owning slice: M005/S01
- Supporting slices: M005/S02
- Validation: M005/S01 — tracker built (1343 bytes, ≤2KB), esbuild pipeline exits 0, 3 placeholders preserved, BaseLayout injects tracker inline with credential substitution, data-affiliate on product links, astro check 0 errors; live runtime proof (rows in analytics_events) deferred to human UAT. M005/S02 — admin panel /analytics page renders real Supabase data (pageviews, unique visitors, affiliate clicks, top pages, per-site table); filter UI (site + date range) functional; analytics_daily graceful empty state; country Phase 1 placeholder; build exits 0; typecheck exits 0.
- Notes: Country is always null in Phase 1 (D081); CF-IPCountry not available in browser→Supabase direct POST. Transport is fetch+keepalive not sendBeacon (D084) — PostgREST requires custom auth headers that sendBeacon cannot set.

### R010 — Monster Chat agent
- Class: primary-user-loop
- Status: active
- Description: Conversational agent with full portfolio context (all sites, analytics, status). Streaming responses. Persistent conversation history. Can answer portfolio questions, suggest actions, and initiate workflows.
- Why it matters: The admin panel is the cockpit; Monster is the co-pilot. Context-aware answers replace manual dashboard navigation for most operational questions.
- Source: user
- Primary owning slice: M007/S01
- Supporting slices: none
- Validation: M007/S01 — ClaudeSDKClient.streamQuery() + createMonsterMcpServer() with 4 portfolio tools; /api/monster/chat SSE Route Handler; curl verified: tokens stream progressively, response references real site count from DB via MCP getPortfolioStats tool call (pm2 logs confirm tool invocation); agent_session_id persisted for session resume; conversation history persisted in chat_messages. Browser UAT pending (Playwright/Chromium missing libnspr4.so on VPS1). Full R010 validation (browser streaming responsiveness feels natural) requires human UAT.

### R011 — Domain management via Spaceship + Cloudflare
- Class: operability
- Status: active
- Description: Pipeline checks domain availability (Spaceship), user approves purchase, domain registered (Spaceship), NS delegated to Cloudflare, A record created pointing to VPS2. All automated except the purchase approval step.
- Why it matters: Manual domain setup doesn't scale.
- Source: user
- Primary owning slice: M004/S02
- Supporting slices: M004/S01
- Validation: unmapped
- Notes: Domain purchase ALWAYS requires explicit user approval. No exceptions.

### R012 — Finances: cost tracking + P&L
- Class: admin/support
- Status: active
- Description: Track fixed costs (hosting, AI, tools) and per-site costs (domains). Amazon Associates revenue via manual CSV import (subtags per site). P&L dashboard with ROI per site.
- Why it matters: The business model requires knowing unit economics. Without P&L, you can't tell if you're making money.
- Source: user
- Primary owning slice: M008/S01
- Supporting slices: M008/S02
- Validation: M008 — CSV import (EN+ES formats, subtag attribution, unattributed warnings), manual revenue entry, computePnL pure aggregator, per-site ROI, domain expiry alerts, CSV export — all implemented, typecheck + build + pm2 reload pass. Human UAT pending (real Amazon Associates CSV + spreadsheet verification of export).
- Notes: Amazon API auto-sync deferred to Phase 2. Implementation complete; transitions to validated after human UAT confirms real-data correctness.

### R013 — Admin panel on VPS1 via pm2
- Class: operability
- Status: validated
- Description: Next.js 15 admin panel runs as a pm2 process on VPS1, accessible only via Tailscale. Deploy workflow: build on branch → squash merge to main → `pm2 reload monster-admin`.
- Why it matters: The panel must be always-on and survive reboots. Tailscale ensures it's never public-facing.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S05
- Validation: M001/S05 — pm2 shows monster-admin online (0 restarts), curl returns HTTP 200 on port 3004, process list saved to ~/.pm2/dump.pm2

### R014 — Worktree-based development workflow
- Class: constraint
- Status: active
- Description: All development happens in git worktrees at `/home/daniel/monster-work/gsd/<milestone>/<slice>`. The main repo at `/home/daniel/monster/` stays on `main` = production at all times. Slices squash-merged to main on completion.
- Why it matters: The repo lives on the production VPS. Developing directly on main would risk breaking production.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: unmapped

### R015 — 3 TSA Astro templates (Classic, Modern, Minimal)
- Class: differentiator
- Status: validated
- Description: Three visually distinct Astro templates for TSA sites. Each defines layout, grid, style. Per-site customization: colors, typography, logo, favicon via CSS custom properties.
- Why it matters: Visual differentiation across portfolio reduces footprint detection. Different templates for different niches.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: M003/S02
- Validation: M003/S01 — Classic/Modern/Minimal implemented across all page types (homepage, category, product, 4 legal); CSS custom property theming via define:vars (primary, accent, font); astro check exit 0 (10 files, 0 errors); 11-page fixture build verified; affiliate links contain ?tag=; no Amazon CDN URLs in built HTML

### R033 — Generate Site button feedback
- Class: primary-user-loop
- Status: active
- Description: Clicking "Generate Site" immediately shows a loading indicator; the button reflects live job status (pending/running/completed/failed) by polling ai_jobs. User knows the job is running without guessing.
- Why it matters: Silent form submission makes the operator think the button didn't work and click twice, queuing duplicate jobs.
- Source: user
- Primary owning slice: M009/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Uses existing ai_jobs polling pattern (same as DeployStatus component).

### R034 — Auth via claude-agent-sdk only (no API key)
- Class: constraint
- Status: active
- Description: All Claude AI calls use the claude-agent-sdk which authenticates via the system's claude CLI OAuth token (Pro/Max plan). The claude_api_key settings field is removed entirely.
- Why it matters: Architectural requirement from project inception — D007. Having both auth methods is contradictory and confusing.
- Source: user
- Primary owning slice: M009/S01
- Supporting slices: none
- Validation: unmapped

### R035 — AI SEO text generation in category/product forms
- Class: primary-user-loop
- Status: active
- Description: A "Generate with AI" button next to each SEO text field in CategoryForm and ProductForm calls an API route that streams AI-generated content with full site/category context. User can regenerate or edit the result.
- Why it matters: Manual SEO writing at 50+ products/site is not viable. AI assist at the form level completes the content loop.
- Source: user
- Primary owning slice: M009/S02
- Supporting slices: none
- Validation: unmapped

### R036 — Chat markdown rendering
- Class: quality-attribute
- Status: active
- Description: Chat assistant responses render markdown formatting (bold, headers, lists, code blocks, links) in the chat UI.
- Why it matters: Claude responses use markdown extensively. Plain text rendering makes structured responses unreadable.
- Source: user
- Primary owning slice: M009/S01
- Supporting slices: none
- Validation: unmapped

### R037 — Global chat sidebar with page context
- Class: primary-user-loop
- Status: active
- Description: Monster chat is accessible as a collapsible right panel on all dashboard pages. The current page context (route label) is included in every message so the assistant knows where the user is.
- Why it matters: Navigating to /monster to ask a question breaks the workflow. Context-aware answers from any page are 10x more useful.
- Source: user
- Primary owning slice: M009/S03
- Supporting slices: none
- Validation: unmapped

### R038 — System prompt editor in Settings
- Class: admin/support
- Status: active
- Description: System prompts for all agents (Monster, NicheResearcher, ContentGenerator) are editable in the Settings page and stored in the agent_prompts DB table. Agents read DB override at job start; fall back to hardcoded default.
- Why it matters: The operator needs to tune agent behavior (language, tone, rules) without a code deploy.
- Source: user
- Primary owning slice: M009/S02
- Supporting slices: none
- Validation: unmapped

### R039 — Amazon scraper for product search
- Class: primary-user-loop
- Status: active
- Description: Product search in the admin panel uses an Amazon scraper (Node.js + cheerio, rotating user agents) instead of DataForSEO. DFS is only called for ASIN-level enrichment when adding a selected product.
- Why it matters: DataForSEO product search costs money per query. Scraper makes product discovery free.
- Source: user
- Primary owning slice: M009/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Ported from danielmrdev/tsa-monster AmazonScraperService.php.

### R040 — SEO files per generated site
- Class: quality-attribute
- Status: active
- Description: Every generated site dist contains sitemap.xml (all page URLs), robots.txt (allow all + sitemap reference), and llm.txt (site description for AI agents).
- Why it matters: Sitemap and robots.txt are baseline SEO requirements. llm.txt is emerging standard for AI agent crawlers.
- Source: user
- Primary owning slice: M009/S05
- Supporting slices: none
- Validation: unmapped

### R041 — Search engine ping on deploy
- Class: operability
- Status: active
- Description: When a site deploys successfully, the deploy phase pings Google and Bing via IndexNow API to request crawling.
- Why it matters: Without a ping, search engines may take days to discover new or updated content. Pinging accelerates indexing.
- Source: user
- Primary owning slice: M009/S05
- Supporting slices: none
- Validation: unmapped

### R042 — Legal page templates (editable, assignable)
- Class: primary-user-loop
- Status: active
- Description: Legal page templates (privacy policy, terms of use, cookies, contact) are stored in DB as markdown, editable in a dedicated /templates section. Multiple templates per type (different languages, sectors). Each site can have one template assigned per type. Rendered in Astro at build time.
- Why it matters: Legal pages are mandatory for every site. Copy-pasting and editing raw Astro files doesn't scale. Templates with language/sector variants save hours per site.
- Source: user
- Primary owning slice: M009/S06
- Supporting slices: none
- Validation: unmapped

### R043 — Dashboard: enriched alerts and financial summary
- Class: failure-visibility
- Status: active
- Description: Dashboard shows recent failed jobs (name, site, timestamp, error snippet), open product alerts count with link, top 5 sites by pageviews, and a P&L summary widget (total revenue - total costs this month).
- Why it matters: The dashboard is the first screen the operator sees. It should surface actionable information immediately, not just KPI counts.
- Source: user
- Primary owning slice: M009/S01
- Supporting slices: none
- Validation: unmapped

### R044 — Affiliate tag per-site (not global)
- Class: constraint
- Status: active
- Description: Each site has its own affiliate_tag field (already exists on the sites table). There is no global affiliate_tag in Settings. Sites without an affiliate_tag show a warning.
- Why it matters: Different sites need different affiliate tags for revenue attribution. A global tag would incorrectly attribute all revenue to one tag.
- Source: user
- Primary owning slice: M009/S01
- Supporting slices: none
- Validation: unmapped
- Notes: affiliate_tag already on sites table from M001. Confirm amazon_affiliate_tag is NOT in SETTINGS_KEYS (it currently is — remove it).

## Deferred

### R020 — Amazon Associates API auto-sync
- Class: integration
- Status: deferred
- Description: Automatic daily sync of Amazon Associates earnings via PA-API reporting. Revenue by site via subtags.
- Why it matters: Removes manual CSV import step once at scale.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred to Phase 2. PA-API access for ES can take weeks to approve. Manual CSV import sufficient for Phase 1.

### R021 — AdSense revenue integration
- Class: integration
- Status: deferred
- Description: Google AdSense Management API v2 auto-sync. OAuth 2.0.
- Why it matters: Needed when AdSense blogs (Phase 2) go live.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred to Phase 2 (M007+) when AdSense site type is implemented.

### R022 — ContentOptimizer agent
- Class: primary-user-loop
- Status: deferred
- Description: Analyze existing content vs performance metrics. Suggest copy/keyword/structure improvements.
- Why it matters: Phase 2 optimization loop.
- Source: user
- Primary owning slice: none
- Validation: unmapped
- Notes: Deferred to Phase 2.

### R023 — PerformanceMonitor agent
- Class: failure-visibility
- Status: deferred
- Description: Monitor all site metrics, detect traffic drops, errors, degradation. Suggest actions.
- Why it matters: Phase 2 autonomous monitoring.
- Source: user
- Primary owning slice: none
- Validation: unmapped
- Notes: Deferred to Phase 2.

### R024 — Analytics country via Supabase Edge Function
- Class: quality-attribute
- Status: deferred
- Description: Server-side IP geolocation via MaxMind GeoLite2 in a Supabase Edge Function. Precise country data without client-side exposure.
- Why it matters: More accurate geo analytics than CF-IPCountry alone.
- Source: inferred
- Primary owning slice: none
- Validation: unmapped
- Notes: CF-IPCountry from Cloudflare covers Phase 1 needs. Edge Function geolocation deferred until accuracy becomes a priority.

### R025 — DataForSEO Backlinks API
- Class: differentiator
- Status: deferred
- Description: Backlink analysis for niche research and competitor scanning.
- Why it matters: Deeper competitive analysis for Research Lab.
- Source: user
- Primary owning slice: none
- Validation: unmapped
- Notes: $100/month minimum. Deferred until Phase 1 gate proven. NicheResearcher works without backlinks.

## Out of Scope

### R030 — Multi-market Phase 1 (US/UK)
- Class: constraint
- Status: out-of-scope
- Description: Phase 1 implements ES market only. Architecture supports multiple markets but only ES is active.
- Why it matters: Prevents scope creep. Adding US/UK is trivial after pipeline is validated with ES.
- Source: user
- Primary owning slice: none
- Validation: n/a
- Notes: Market field in schema supports all 10 Amazon markets. ES first, expand in Phase 2.

### R031 — Autonomous domain purchases
- Class: anti-feature
- Status: out-of-scope
- Description: Agents never purchase domains autonomously. Purchase always requires explicit user approval in admin panel.
- Why it matters: Prevents accidental spend. Real money requires human confirmation.
- Source: user
- Primary owning slice: none
- Validation: n/a

### R032 — SaaS / multi-tenant / software sales
- Class: anti-feature
- Status: out-of-scope
- Description: BuilderMonster is for self-operation only. No tenant management, billing, or user accounts beyond the owner.
- Why it matters: Scope boundary. SaaS would require a completely different architecture.
- Source: user
- Primary owning slice: none
- Validation: n/a

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | primary-user-loop | active | M003/S02 | M002/S01, M003/S01, M004/S01 | unmapped |
| R002 | constraint | active | M001/S02 | M003/S01, M007/S01 | unmapped |
| R003 | primary-user-loop | active | M007/S02 | M007/S01 | M007/S02 (partial — structural proof done; real DFS data pending human UAT) |
| R004 | primary-user-loop | validated | M003/S03 | M003/S01 | M003/S03 |
| R005 | quality-attribute | validated | M003/S04 | M003/S02 | M003/S04 |
| R006 | operability | active | M004/S01 | M004/S02 | unmapped |
| R007 | continuity | active | M006/S01 | M006/S02 | M006/S01+S02 (partial — end-to-end runtime + human UAT pending) |
| R008 | failure-visibility | active | M006/S02 | M002/S01 | M006/S02 (partial — dashboard surface S03 + dedup live runtime pending) |
| R009 | primary-user-loop | active | M005/S01 | M005/S02 | M005/S01+S02 (partial — S03 aggregation + human UAT pending) |
| R010 | primary-user-loop | active | M007/S01 | none | M007/S01 (partial — SSE streaming + MCP tool calls integration-verified via curl; browser UAT pending) |
| R011 | operability | active | M004/S02 | M004/S01 | unmapped |
| R012 | admin/support | active | M008/S01 | M008/S02 | M008 (partial — contract + build verified; human UAT with real data pending) |
| R013 | operability | validated | M001/S04 | M001/S05 | M001/S05 |
| R014 | constraint | active | M001/S01 | none | unmapped |
| R015 | differentiator | validated | M003/S01 | M003/S02 | M003/S01 |
| R020 | integration | deferred | none | none | unmapped |
| R021 | integration | deferred | none | none | unmapped |
| R022 | primary-user-loop | deferred | none | none | unmapped |
| R023 | failure-visibility | deferred | none | none | unmapped |
| R024 | quality-attribute | deferred | none | none | unmapped |
| R025 | differentiator | deferred | none | none | unmapped |
| R030 | constraint | out-of-scope | none | none | n/a |
| R031 | anti-feature | out-of-scope | none | none | n/a |
| R032 | anti-feature | out-of-scope | none | none | n/a |
| R033 | primary-user-loop | active | M009/S01 | none | unmapped |
| R034 | constraint | active | M009/S01 | none | unmapped |
| R035 | primary-user-loop | active | M009/S02 | none | unmapped |
| R036 | quality-attribute | active | M009/S01 | none | unmapped |
| R037 | primary-user-loop | active | M009/S03 | none | unmapped |
| R038 | admin/support | active | M009/S02 | none | unmapped |
| R039 | primary-user-loop | active | M009/S04 | none | unmapped |
| R040 | quality-attribute | active | M009/S05 | none | unmapped |
| R041 | operability | active | M009/S05 | none | unmapped |
| R042 | primary-user-loop | active | M009/S06 | none | unmapped |
| R043 | failure-visibility | active | M009/S01 | none | unmapped |
| R044 | constraint | active | M009/S01 | none | unmapped |

## Coverage Summary

- Active requirements: 27
- Mapped to milestones: 27
- Validated: 4 (R013, R004, R005, R015)
- Unmapped active requirements: 0
