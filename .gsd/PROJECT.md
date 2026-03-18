# BuilderMonster

Single admin panel to manage the full lifecycle of a website portfolio: AI-assisted generation (content, images, niches, recommendations), deployment, SEO optimization, and continuous maintenance. Every generated page is maximally optimized to rank high and fast in search engines. Business model: self-operated portfolio (not software sales).

## Core Value

AI-driven, SEO-first site generation pipeline — from niche research to deployed affiliate site.

## Current State

Fully operational across all foundational milestones:
- Sites CRUD + deployment pipeline (Hetzner VPS + Caddy + Cloudflare)
- TSA site generator (Astro.js, single unified template)
- Product refresh pipeline (DataForSEO + BullMQ)
- Monster Chat + Research Lab (Agent SDK + MCP)
- Analytics tracking (custom lightweight script → Supabase)
- Finances dashboard (Amazon revenue + cost tracking)
- Admin panel fully functional with site detail, categories, products, deploy status, SEO scores

## Architecture / Key Patterns

- **Admin Panel:** Next.js 15 (App Router, RSC, Server Actions) + shadcn/ui + Tailwind v4
- **Backend/DB:** Next.js API routes + Supabase Cloud (PostgreSQL + Auth + Real-time + Storage)
- **Site Generation:** Astro.js (fully static) + Tailwind CSS
- **Queue:** BullMQ + Upstash Redis (managed)
- **AI Agents:** `@anthropic-ai/claude-agent-sdk` for interactive/autonomous agents
- **AI Content:** `@anthropic-ai/sdk` for batch structured-output generation
- **Jobs pattern:** `ai_jobs` table row (pending→running→completed/failed) + BullMQ Worker class
- **SEO scoring:** `@monster/seo-scorer` — `scorePage(html, focusKeyword, pageType)` returns 8-dimension scores

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Foundation — monorepo, DB schema, base types
- [x] M002: Admin Panel MVP — sites CRUD, categories, products
- [x] M003: TSA Site Generator — Astro.js static generation
- [x] M004: Deployment + Cloudflare — Hetzner VPS + Caddy + DNS
- [x] M005: Analytics — custom tracking script + Supabase
- [x] M006: Product Refresh Pipeline — DataForSEO + BullMQ cron
- [x] M007: Monster Chat + Research Lab — Agent SDK + MCP
- [x] M008: Finances + Amazon Revenue — cost tracking + P&L
- [x] M009: UX Polish + Capabilities Upgrade — admin polish
- [x] M010: VPS Hetzner Provisioning — server provisioning UI
- [x] M011: Hetzner Multi-VPS Infrastructure — fleet management
- [x] M012: Admin Polish + Mobile-First Sites — mobile nav, legal templates
- [x] M013: TSA Template Redesign — single unified template + link cloaking
- [x] M014: Site Detail & Edit — UX & Data Improvements
- [ ] M015: SEO Content Generation — AI-powered SEO text with scoring feedback loop
