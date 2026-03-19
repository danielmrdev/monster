# BuilderMonster

Single admin panel to manage the full lifecycle of a website portfolio: AI-assisted generation, deployment, SEO optimization, and continuous maintenance.

## What is this?

A platform to generate, deploy, and monetize websites automatically. AI is the core engine — it generates content, researches niches, scores SEO, recommends improvements, and keeps sites updated. Every page is maximized for search engine ranking.

**Business model:** Self-operated website portfolio (not SaaS).

## Tech Stack

| Layer              | Technology                                                             |
| ------------------ | ---------------------------------------------------------------------- |
| Admin Panel        | Next.js 15 (App Router, RSC, Server Actions) + shadcn/ui + Tailwind v4 |
| Database           | Supabase Cloud (PostgreSQL + Auth + Real-time + Storage)               |
| Site Generation    | Astro.js (fully static, SEO-optimized) + Tailwind CSS                  |
| AI Agents          | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)                    |
| AI Content         | Claude API (`@anthropic-ai/sdk`) via BullMQ                            |
| Domains            | Spaceship.com API (registration + DNS)                                 |
| Product & SEO Data | DataForSEO (Amazon products, keyword research, SERPs)                  |
| Queue              | BullMQ + Upstash Redis                                                 |
| Infra (Admin)      | Hetzner VPS + Tailscale (private)                                      |
| Infra (Sites)      | Hetzner VPS + Caddy (public, auto-SSL)                                 |

## Project Structure

Monorepo with pnpm workspaces:

```
apps/
  admin/          — Next.js 15 admin panel
  generator/      — Astro.js site generation engine + templates

packages/
  agents/         — AI agent definitions (Monster Chat, NicheResearcher, ContentGenerator)
  db/             — Supabase schema, migrations, typed client
  analytics/      — Tracking script + event processing
  domains/        — Spaceship API client
  seo-scorer/     — On-page SEO scoring engine
  deployment/     — VPS deployment service (rsync + Caddy config)
  shared/         — Shared types, constants, utilities
```

## Current Phase

**Phase 1: MVP — TSA (Amazon Affiliate) Sites Only**

Architecture is extensible for future site types (AdSense blogs, multi-affiliate, lead gen, etc.).

## Documentation

- `CLAUDE.md` — AI agent context (project rules, architecture, decisions)
- `docs/research/` — Research documents (SEO scoring, etc.)
- PRD and Vision docs maintained externally in Obsidian

## License

Private. All rights reserved.
