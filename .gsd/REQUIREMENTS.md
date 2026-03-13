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
- Validation: unmapped

### R004 — AI content generation (batch, SEO-optimized)
- Class: primary-user-loop
- Status: active
- Description: ContentGenerator produces category SEO texts (~400 words), product descriptions, pros/cons, user opinion summaries, meta descriptions — all in the site's language, optimized for conversion and ranking.
- Why it matters: Content quality and volume is the primary SEO lever. Manual content at 50+ products/site is not viable.
- Source: user
- Primary owning slice: M003/S03
- Supporting slices: M003/S01
- Validation: unmapped
- Notes: Throttle-aware (Plan Pro). Zod schemas for structured output.

### R005 — SEO Scorer: automated on-page validation
- Class: quality-attribute
- Status: active
- Description: Every generated page gets a 0-100 SEO score across 8 categories before deploy. Pages scoring < 70 trigger warnings. Score data persisted in Supabase, visible in site detail view.
- Why it matters: SEO quality is the product. Shipping pages below threshold wastes the site's authority budget.
- Source: user
- Primary owning slice: M003/S04
- Supporting slices: M003/S02
- Validation: unmapped
- Notes: Research in `docs/research/seo-scoring-research.md`. Focus keyword passed explicitly from DB.

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
- Validation: unmapped

### R008 — Product availability alerts
- Class: failure-visibility
- Status: active
- Description: When products become unavailable, the system creates alerts (product unavailable, category empty, site degraded >30%). Alerts visible in Dashboard. Unavailable products excluded from site.
- Why it matters: Silent degradation kills revenue. User needs to know which sites need attention.
- Source: user
- Primary owning slice: M006/S02
- Supporting slices: M002/S01
- Validation: unmapped

### R009 — Analytics: lightweight GDPR-friendly tracking
- Class: primary-user-loop
- Status: active
- Description: Each generated site embeds a ~2KB vanilla JS tracking script. Events (pageview, affiliate click) POST directly to Supabase. No cookies. Country from CF-IPCountry. Language from navigator.language.
- Why it matters: Without traffic data the portfolio is blind. Knowing which pages and sites perform is necessary for every optimization decision.
- Source: user
- Primary owning slice: M005/S01
- Supporting slices: M005/S02
- Validation: unmapped

### R010 — Monster Chat agent
- Class: primary-user-loop
- Status: active
- Description: Conversational agent with full portfolio context (all sites, analytics, status). Streaming responses. Persistent conversation history. Can answer portfolio questions, suggest actions, and initiate workflows.
- Why it matters: The admin panel is the cockpit; Monster is the co-pilot. Context-aware answers replace manual dashboard navigation for most operational questions.
- Source: user
- Primary owning slice: M007/S01
- Supporting slices: none
- Validation: unmapped

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
- Validation: unmapped
- Notes: Amazon API auto-sync deferred to Phase 2.

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
- Status: active
- Description: Three visually distinct Astro templates for TSA sites. Each defines layout, grid, style. Per-site customization: colors, typography, logo, favicon via CSS custom properties.
- Why it matters: Visual differentiation across portfolio reduces footprint detection. Different templates for different niches.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: M003/S02
- Validation: unmapped

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
| R003 | primary-user-loop | active | M007/S02 | M007/S01 | unmapped |
| R004 | primary-user-loop | active | M003/S03 | M003/S01 | unmapped |
| R005 | quality-attribute | active | M003/S04 | M003/S02 | unmapped |
| R006 | operability | active | M004/S01 | M004/S02 | unmapped |
| R007 | continuity | active | M006/S01 | M006/S02 | unmapped |
| R008 | failure-visibility | active | M006/S02 | M002/S01 | unmapped |
| R009 | primary-user-loop | active | M005/S01 | M005/S02 | unmapped |
| R010 | primary-user-loop | active | M007/S01 | none | unmapped |
| R011 | operability | active | M004/S02 | M004/S01 | unmapped |
| R012 | admin/support | active | M008/S01 | M008/S02 | unmapped |
| R013 | operability | validated | M001/S04 | M001/S05 | M001/S05 |
| R014 | constraint | active | M001/S01 | none | unmapped |
| R015 | differentiator | active | M003/S01 | M003/S02 | unmapped |
| R020 | integration | deferred | none | none | unmapped |
| R021 | integration | deferred | none | none | unmapped |
| R022 | primary-user-loop | deferred | none | none | unmapped |
| R023 | failure-visibility | deferred | none | none | unmapped |
| R024 | quality-attribute | deferred | none | none | unmapped |
| R025 | differentiator | deferred | none | none | unmapped |
| R030 | constraint | out-of-scope | none | none | n/a |
| R031 | anti-feature | out-of-scope | none | none | n/a |
| R032 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 15
- Mapped to milestones: 15
- Validated: 0
- Unmapped active requirements: 0
