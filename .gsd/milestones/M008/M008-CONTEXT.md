# M008: Finances + Amazon Revenue — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M007 is complete

## Why This Milestone

The business model requires clear unit economics. M008 completes the Finances panel: full cost tracking (fixed + per-site), Amazon Associates revenue via CSV import (subtags per site), and the P&L dashboard showing ROI per site. After M008, the user has a complete picture of what each site costs and earns.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Log fixed monthly costs (Anthropic, Hetzner, Upstash, etc.)
- See domain costs automatically populated from the `domains` table (registered via M004)
- Import an Amazon Associates CSV report → revenue auto-assigned to sites by subtag
- View P&L dashboard: total revenue vs total costs, profit per site, sites profitable vs not
- Export P&L data as CSV

### Entry point / environment
- Entry point: Finances section in admin panel
- Environment: VPS1, Supabase Cloud
- Live dependencies: Supabase Cloud

## Completion Class

- Contract complete means: CSV import correctly maps subtag → site → revenue entries
- Integration complete means: P&L numbers match manual calculation from same data
- Operational complete means: monthly P&L report generatable at any time

## Final Integrated Acceptance

- Import a real Amazon Associates CSV → revenue rows appear in Finances, attributed to correct sites
- Add 3 fixed cost entries → P&L shows correct net profit
- Export P&L as CSV → verify numbers are correct

## Risks and Unknowns

- **Amazon Associates CSV format** — format varies by market (ES vs US have different column layouts). Need to handle ES format specifically, with fallback parsing.
- **Subtag matching** — subtag format is `<main-tag>-<site-slug>-20`. Parsing must be robust to variations Amazon introduces.

## Existing Codebase / Prior Art

- M002: Finances shell (cost entry form, placeholder revenue section)
- M001 DB schema: `costs`, `cost_categories`, `revenue_amazon`, `revenue_manual`, `revenue_daily`, `domains`
- M004: `domains` table populated with real domain records and costs
- `docs/PRD.md`: Finances panel section, data model

## Relevant Requirements

- R012 — Finances: cost tracking + P&L
- D009 in DECISIONS.md: Amazon subtags + CSV import (Phase 1), API auto-sync deferred

## Scope

### In Scope
- Full cost tracking UI: fixed costs, per-site costs (auto from domains), one-time costs
- Amazon Associates CSV import: parse, map subtag → site, store in `revenue_amazon`
- Manual revenue entry (other affiliate programs, sponsorships)
- P&L dashboard: revenue vs costs, profit per site, ROI calculation
- Domain renewal alerts: domains expiring within 60 days
- CSV export of P&L data

### Out of Scope
- Amazon PA-API auto-sync (R020, deferred)
- AdSense revenue integration (R021, deferred to Phase 2)
- Advanced financial projections or forecasting

## Technical Constraints

- Amazon Associates ES CSV columns: Date, Clicks, Ordered Items, Shipped Items, Shipped Revenue, Tracking ID (subtag)
- Subtag → site mapping: `sites.affiliate_subtag` field (set at site creation)
- ROI formula: `(monthly_revenue - monthly_cost) / monthly_cost * 100`
- Monthly cost per site = `domain_cost / 12 + hosting_proration + dataforseo_refresh_cost`

## Integration Points

- Supabase: `costs`, `revenue_amazon`, `revenue_manual`, `revenue_daily`, `domains`
- M004 domains table: domain costs + expiry dates
- File upload: CSV via Next.js Server Action, parsed server-side
