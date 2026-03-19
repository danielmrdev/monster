# BuilderMonster

Single admin panel to manage the full lifecycle of a website portfolio: AI-assisted generation (content, images, niches, recommendations), deployment, SEO optimization, and continuous maintenance. Every generated page is maximally optimized to rank high and fast in search engines. Business model: self-operated portfolio (not software sales).

Evolution of `danielmrdev/tsa-monster` (Laravel + FilamentPHP + Astro.js, validated with production TSA sites) to a modern stack with AI-native agents.

## Tech Stack

- **Admin Panel:** Next.js 15 (App Router, RSC, Server Actions) + shadcn/ui + Tailwind v4 + React Hook Form + Zod
- **Backend/DB:** Next.js API routes + Supabase Cloud (PostgreSQL + Auth + Real-time + Storage)
- **Site Generation:** Astro.js (fully static, SEO-optimized) + Tailwind CSS
- **Infra Admin:** Hetzner VPS behind Tailscale (private access only)
- **Infra Sites:** Hetzner VPS (public) + Caddy (auto-SSL)
- **Network:** VPS 1 (admin, private) → rsync via Tailscale SSH → VPS 2 (sites, public)
- **AI (Agents):** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Monster Chat, NicheResearcher, autonomous agents
- **AI (Content):** Claude API (`@anthropic-ai/sdk`) — batch content generation (SEO texts, descriptions) via BullMQ
- **AI Plan:** Anthropic Pro ($20/month). Upgrade to Max when rate limits require it.
- **Queue:** BullMQ + Upstash Redis (managed)
- **Deploy Admin:** Hetzner VPS behind Tailscale (NOT Vercel — private access only)
- **Deploy Sites:** Hetzner VPS (CX22/CX32, public) + Caddy (auto-SSL via Let's Encrypt)
- **Analytics:** Custom tracking script → POST direct to Supabase Cloud (anon key + RLS INSERT-only)
- **Domains:** Spaceship.com (ICANN-accredited registrar) — registration, DNS management, transfers via REST API
- **Product & SEO Data:** DataForSEO (pay-as-you-go) — Amazon product data (Merchant API), keyword research (Labs API), SERPs, trends
- **Cron:** Vercel Cron

## Project Structure

Monorepo with pnpm workspaces:

```
apps/
  admin/          — Next.js 15 admin panel (dashboard, sites, chat, research, analytics, settings)
  generator/      — Astro.js site generation engine + templates (grouped by site type: tsa/, blog/, etc.)

packages/
  agents/         — AI agent definitions (Monster, NicheResearcher, ContentGenerator)
  db/             — Supabase schema, migrations, typed client
  analytics/      — Tracking script + event processing
  domains/        — Spaceship API client (domain registration, DNS records, availability checks)
  seo-scorer/     — On-page SEO scoring engine (0-100 per page, page-type-aware thresholds)
  deployment/     — VPS deployment service (rsync + Caddy config)
  shared/         — Shared types, constants, utilities
```

## Current Phase: 1 (MVP) — TSA Sites Only

Phase 1 implements ONLY TSA (Amazon Affiliate) sites. Architecture must be extensible for future site types (AdSense, Multi-Affiliate, Lead Gen, etc.).

### TSA Site Structure

- **Homepage:** Hero (Unsplash stock) + category grid + featured products + SEO text
- **Category pages:** SEO text (~400 words) + product grid. Category image = representative product image.
- **Product pages:** Large image + gallery (local, downloaded from Amazon, optimized WebP), AI content
- **Legal pages:** Legal notice, privacy, cookies, contact (mandatory)
- **Templates:** 3 variants (Classic, Modern, Minimal) — define layout/grid/style. Per-site customization: colors, typography, logo, favicon.
- **Images:** All served as local static assets (never hotlinked). Products: Amazon download → WebP. Stock: Unsplash. AI: on user demand only.

### TSA Data Model

- Site: name, domain, niche, market (1 Amazon market), language (1 language for all content), currency, affiliate_tag, template, customization (colors, typography, logo, favicon)
- Rule: 1 site = 1 language + 1 Amazon market. All content, UI, legal pages in that language. All affiliate links to that market's Amazon domain.
- Category: name, slug, representative_product_image, SEO text, keywords[]
- Product: ASIN, title, price, images[] (local WebP paths), rating, reviews, is_prime, AI content

## Admin Panel Screens

1. **Dashboard** — Portfolio KPIs: sites count, revenue, visits, clicks, alerts, costs, P&L
2. **Sites** — CRUD, detail view with stats/categories/products/deploy status
3. **Monster Chat** — Conversational agent with full portfolio context
4. **Research Lab** — Autonomous niche research (input idea → background AI analysis → report). Domain suggestions validated against Spaceship availability API in real-time.
5. **Analytics** — Global + per-site metrics (visits, pageviews, clicks, conversions, country, language)
6. **Finances** — Costs tracking + revenue (Amazon Associates API, AdSense API Phase 2+, manual). Costs: domain registration (Spaceship), hosting (Hetzner), AI (Anthropic). P&L dashboard, ROI per site.
7. **Settings** — Affiliate tags, API keys (Claude, Amazon Associates, Spaceship, DataForSEO, AdSense OAuth), deployment config, defaults

## AI Agents

### Agent SDK agents (interactive, autonomous, with built-in tools)

1. **Monster** — Chat agent (`ClaudeSDKClient` with streaming). Full portfolio context via system prompt + MCP server for DB access. Tools: WebSearch, WebFetch, Bash, custom MCP tools.
2. **NicheResearcher** — Autonomous background agent (`query()` with `maxTurns` limit). Tools: DataForSEO (Labs, SERP, Keywords, Merchant/Amazon), Spaceship (domain availability only — NEVER purchases), WebSearch, WebFetch. Runs in BullMQ job, streams results to DB.

### Claude API agents (batch content generation via BullMQ)

3. **ContentGenerator** — Batch content via `@anthropic-ai/sdk`. Generates SEO texts, product descriptions, pros/cons, homepage copy. Uses structured outputs (Zod schemas) for consistent format.
4. **ContentOptimizer** (Phase 2+) — Analyze + improve existing content based on performance
5. **PerformanceMonitor** (Phase 2+) — Monitor metrics, detect issues, suggest actions

## Analytics System

- Lightweight vanilla JS tracking script (~2KB), embedded in generated sites
- No cookies, no personal data — GDPR-friendly
- Visitor hash = hash(date + IP + user-agent), no cross-day tracking
- Events: pageview, click_affiliate, click_category
- Data: site_id, event_type, page_path, referrer, country, language
- Raw events (90-day retention) → daily aggregates (indefinite)

## Infrastructure

- **VPS 1 (Monster, private):** Admin panel + BullMQ workers + Astro generator + AI agents. Behind Tailscale.
- **VPS 2 (Sites, public):** Caddy serving static sites. Public IP, domains point here.
- **Supabase Cloud:** Shared DB. Accessible from both VPS and from public sites (analytics via anon key + RLS).
- **Domains:** Spaceship API — semi-auto purchase (ALWAYS requires explicit user approval). Flow: check availability → user approves purchase in admin panel → register domain → set DNS A record to VPS 2 IP → wait propagation. Agents NEVER purchase domains autonomously.
- **Product Refresh:** Cron (BullMQ) → DataForSEO fetch → diff with DB → rebuild only if changes → redeploy. Hybrid strategy: keyword search frequent + ASIN selective. Alerts for unavailable products.
- **Deployment:** VPS 1 builds Astro → rsync via Tailscale SSH → VPS 2. Caddy auto-configures virtualhost + SSL.
- **Analytics:** Public sites POST directly to Supabase Cloud (never hits VPS 1).

## Development Guidelines

- Package manager: `pnpm`
- Agent SDK: `@anthropic-ai/claude-agent-sdk` (Monster Chat, NicheResearcher — interactive/autonomous agents)
- Claude API: `@anthropic-ai/sdk` (ContentGenerator — batch content generation in BullMQ jobs)
- Model: `claude-sonnet-4-6` for content generation, Agent SDK default for agents
- All content generation through BullMQ jobs, never synchronous
- Supabase migrations in `packages/db/`
- Generated Astro sites must be fully static (no SSR)
- Site type is an abstract concept — TSA is the first implementation
- Target cost per site: ~$4/month (domain + hosting + DataForSEO product refresh)
- **Version:** Root `package.json` is single source of truth. On milestone completion, run `./scripts/bump-version.sh <patch|minor|major>`. Criteria: `patch` = bug fixes, infra, polish; `minor` = new features/screens/integrations; `major` = breaking changes, rewrites.

## Code Quality

- **Linter:** oxlint (Rust, 50-100x faster than ESLint). Config: `oxlint.json`
- **Formatter:** oxfmt (Rust, 30x faster than Prettier, 100% compatible). No extra config needed (defaults).
- **Pre-commit hook:** husky + lint-staged. On every `git commit`:
  1. oxlint --fix on staged files (.js/.jsx/.ts/.tsx)
  2. oxfmt --write on staged files
  3. If oxlint fails → commit blocked
- **Commits:** Conventional Commits (`type(scope): description`). Hook runs automatically — NEVER use `--no-verify`.
- **Version bump:** `./scripts/bump-version.sh <patch|minor|major>` on milestone completion.
- **Skill `/commit`:** Assisted commit with conventional commits + optional version bump.
- **Scripts:** `pnpm lint`, `pnpm format`, `pnpm lint:fix`, `pnpm format:check`

## Decisions Made

- Sites separated by type (one site = one monetization model)
- Taxonomy in Supabase (relational, queryable)
- Hosting: Hetzner VPS + Caddy (€3.79/month for 200+ sites, 20TB traffic)
- Analytics: custom lightweight tracker, no cookies, GDPR-friendly
- Domains: Spaceship.com API (registration + DNS). Docs: https://docs.spaceship.dev/

## Decisions Made — Agent Autonomy

- **Domain purchases:** ALWAYS require explicit user approval in admin panel. Agents propose, user decides. No exceptions.
- **General principle:** agents can research, analyze, and propose autonomously. Any action involving real money (domain purchase, API subscriptions) requires manual confirmation.

## Decisions Pending

1. Multi-market in Phase 1 (ES only vs ES+US+UK)
2. DataForSEO Backlinks API ($100/month min) — activate in Phase 1 or defer?

## Reference

- PRD + Vision: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/DM/01 PROYECTOS/BuilderMonster/`
- Previous project: `danielmrdev/tsa-monster` (Laravel, validated TSA sites in production)

## Operational Notes

- **Admin app** runs on port 3004 as a PM2-managed standalone Next.js server (`monster-admin`). It does **not** hot-reload — always build first, then restart.
- **After any build:** restart ONLY the specific PM2 process — NEVER `pm2 restart all` (other unrelated services are managed by PM2 and must not be touched):
  ```bash
  pm2 restart monster-admin
  pm2 restart monster-worker  # only if worker code changed
  ```
- **Build command:** `pnpm --filter @monster/admin build` from the monorepo root.
