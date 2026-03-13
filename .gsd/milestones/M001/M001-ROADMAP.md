# M001: Foundation

**Vision:** A fully structured, runnable monorepo with an extensible Supabase schema, typed database client, shared packages, and an admin panel shell running on VPS1 via pm2 — accessible via Tailscale. Every subsequent milestone builds on this foundation without structural rework.

## Success Criteria

- `pnpm install` at monorepo root succeeds with zero errors across all workspaces
- `supabase gen types --linked` produces valid TypeScript covering the full Phase 1 schema
- All packages (`db`, `shared`) compile without errors
- Admin panel shell loads in browser at VPS1 Tailscale IP with working Supabase Auth login
- `pm2 list` shows `monster-admin` as online after VPS1 reboot
- New worktree created via `./scripts/new-worktree.sh` lands in correct location on correct branch

## Key Risks / Unknowns

- **Extensible schema design** — getting the base/type-specific table split wrong means rework throughout every subsequent milestone. Highest-risk deliverable in this milestone.
- **pnpm + Next.js 15 + Astro cross-workspace imports** — TypeScript path resolution across workspaces has known pitfalls. Need to validate before downstream packages depend on it.
- **Supabase Auth in Next.js 15 App Router** — `@supabase/ssr` cookie handling differs from legacy helpers. Wrong setup causes auth state to not persist correctly.

## Proof Strategy

- Schema extensibility → retire in S02 by building the full Phase 1 schema and confirming it supports TSA + a hypothetical second site type (blog) with no structural changes to `sites` table
- Cross-workspace imports → retire in S03 by having `apps/admin` successfully import from `packages/db` and `packages/shared` with TypeScript resolving correctly
- Auth in App Router → retire in S04 by completing a full login → session → protected page → logout cycle

## Verification Classes

- Contract verification: `pnpm build` succeeds across all workspaces; `tsc --noEmit` clean; `supabase gen types` produces non-empty output
- Integration verification: admin panel connects to real Supabase Cloud project; auth login/logout cycle works
- Operational verification: pm2 starts `monster-admin` on boot; `scripts/deploy.sh` executes build + reload without error
- UAT / human verification: user opens browser at Tailscale IP, logs in, sees the shell navigation

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 5 slices complete with their must-haves verified
- `pnpm install && pnpm build` clean from monorepo root
- Full Phase 1 schema applied to Supabase Cloud (not just local)
- Types generated and committed to `packages/db/src/types/supabase.ts`
- Admin panel accessible at VPS1:3001 via Tailscale, login works
- pm2 `monster-admin` process survives `pm2 kill && pm2 resurrect`
- Worktree creation script tested and documented

## Requirement Coverage

- Covers: R002 (schema extensibility), R013 (admin on pm2), R014 (worktree workflow)
- Partially covers: R001 (pipeline foundation), R004 (ContentGenerator scaffold)
- Leaves for later: R003, R005-R012, R015 (all downstream milestones)
- Orphan risks: none

## Slices

- [x] **S01: Monorepo + worktree scaffold** `risk:low` `depends:[]`
  > After this: `pnpm install` works, all workspace directories exist with correct package.json files, worktree creation script creates a branch + linked working tree at the right path.

- [ ] **S02: Supabase schema** `risk:high` `depends:[S01]`
  > After this: full Phase 1 schema applied to Supabase Cloud, `supabase gen types --linked` produces complete TypeScript types covering all tables needed through M008.

- [ ] **S03: Shared packages** `risk:low` `depends:[S02]`
  > After this: `packages/db` exports typed Supabase client + generated types; `packages/shared` exports all shared TS types and constants; both compile cleanly and are importable from `apps/admin`.

- [ ] **S04: Admin panel shell** `risk:medium` `depends:[S02, S03]`
  > After this: Next.js 15 admin panel runs in dev and production build, Supabase Auth login/logout cycle works, protected layout with sidebar navigation renders all 7 sections (most showing "Coming soon").

- [ ] **S05: pm2 + deploy script** `risk:low` `depends:[S04]`
  > After this: `pm2 start ecosystem.config.js` launches `monster-admin` on port 3001; `scripts/deploy.sh` builds and reloads it; process survives reboot via `pm2 save && pm2 startup`.

---

## Boundary Map

### S01 → S02, S03, S04, S05

Produces:
- Monorepo root: `package.json` (private, workspaces), `pnpm-workspace.yaml`, `tsconfig.base.json`, `turbo.json` (optional)
- Directory structure: `apps/admin/`, `apps/generator/`, `packages/db/`, `packages/shared/`, `packages/agents/`, `packages/analytics/`, `packages/domains/`, `packages/seo-scorer/`, `packages/deployment/`
- Each package: `package.json` with correct name (`@monster/db`, `@monster/shared`, etc.), `tsconfig.json` extending base
- `scripts/new-worktree.sh`: creates branch `gsd/M001/S01` and worktree at `/home/daniel/monster-work/gsd/M001/S01`
- `ecosystem.config.js` at repo root (skeleton, filled in S05)
- `.env.example` with all required env var names

Consumes: nothing (first slice)

### S02 → S03, S04

Produces:
- Supabase migrations in `packages/db/supabase/migrations/`:
  - `001_core.sql`: `sites`, `site_types`, `site_templates`, `settings`, `domains`, `deployments`
  - `002_tsa.sql`: `tsa_categories`, `tsa_products`, `category_products`
  - `003_analytics.sql`: `analytics_events`, `analytics_daily`
  - `004_seo.sql`: `seo_scores`
  - `005_ai.sql`: `research_sessions`, `research_results`, `chat_conversations`, `chat_messages`, `ai_jobs`
  - `006_finances.sql`: `costs`, `cost_categories`, `revenue_amazon`, `revenue_adsense`, `revenue_manual`, `revenue_daily`
  - `007_alerts.sql`: `product_alerts`
- `packages/db/src/types/supabase.ts`: generated types (committed, not gitignored)
- Schema invariants: `sites.site_type` FK to `site_types.slug`; TSA tables join via `site_id`; `focus_keyword` on `tsa_categories`, `tsa_products`, `sites`

Consumes from S01:
- `packages/db/` directory with package.json and tsconfig

### S03 → S04

Produces:
- `packages/db/src/index.ts`: exports `createClient(url, key)` → typed Supabase client, `createServiceClient()`, `Database` type re-export
- `packages/db/src/client.ts`: server-side client factory using `@supabase/ssr`
- `packages/shared/src/types/index.ts`: shared TypeScript interfaces (`Site`, `SiteType`, `SiteStatus`, `SiteTemplate`, `TsaCategory`, `TsaProduct`, `AmazonMarket`, `Language`, etc.)
- `packages/shared/src/constants/index.ts`: `AMAZON_MARKETS`, `SUPPORTED_LANGUAGES`, `SITE_STATUS_FLOW`, `REBUILD_TRIGGERS`
- Both packages: `pnpm build` produces `dist/` with `.d.ts` declarations

Consumes from S01:
- Package directory scaffolds with `package.json`

Consumes from S02:
- `packages/db/src/types/supabase.ts` (generated types used to type the client exports)

### S04 → S05

Produces:
- `apps/admin`: Next.js 15 App Router project, compilable with `pnpm build`
- `apps/admin/src/lib/supabase/`: `server.ts` (SSR client), `client.ts` (browser client), `middleware.ts` (session refresh)
- `apps/admin/src/app/`: `layout.tsx`, `page.tsx` (redirect to /dashboard), `(auth)/login/page.tsx`, `(dashboard)/layout.tsx` (protected), `(dashboard)/dashboard/page.tsx`, `(dashboard)/sites/page.tsx`, `(dashboard)/monster/page.tsx`, `(dashboard)/research/page.tsx`, `(dashboard)/analytics/page.tsx`, `(dashboard)/finances/page.tsx`, `(dashboard)/settings/page.tsx`
- Auth: login form → Supabase Auth → session cookie → protected routes → logout
- `apps/admin/next.config.ts`: configured for port 3001, transpiles `@monster/*` packages

Consumes from S01:
- `apps/admin/` directory scaffold

Consumes from S02:
- Supabase project URL + anon key (env vars)

Consumes from S03:
- `@monster/db`: typed client imported and used in server components
- `@monster/shared`: types used in component props

### S05 → (production)

Produces:
- `ecosystem.config.js` (filled): `monster-admin` entry, cwd, script `node_modules/.bin/next start`, port 3001, env vars via `.env`, log paths `./logs/pm2-*.log`
- `scripts/deploy.sh`: `git pull origin main && pnpm install --frozen-lockfile && pnpm build && pm2 reload monster-admin`
- `scripts/new-worktree.sh`: `git worktree add /home/daniel/monster-work/gsd/$M/$S gsd/$M/$S 2>/dev/null || git worktree add /home/daniel/monster-work/gsd/$M/$S -b gsd/$M/$S`
- `scripts/squash-merge.sh`: squash-merges current slice branch to main with formatted commit message
- Documentation in `.gsd/milestones/M001/M001-SUMMARY.md`: worktree protocol, deploy protocol, pm2 process management

Consumes from S04:
- `apps/admin` compilable Next.js project
- `package.json` build scripts working
