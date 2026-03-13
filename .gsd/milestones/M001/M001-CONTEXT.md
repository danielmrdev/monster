# M001: Foundation — Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

## Project Description

BuilderMonster — single admin panel for managing a portfolio of SEO-optimized affiliate/content websites. AI is the core engine. Business model: self-operated portfolio. Phase 1: TSA (Amazon Affiliate) sites only.

## Why This Milestone

No code exists yet. Before any feature can be built, the monorepo must be structured correctly, the database schema must be extensible (the biggest risk — painting into a corner means months of rework when Phase 2 site types are added), and the admin panel must be runnable on the production VPS. Everything downstream depends on getting these foundations right.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Run `pnpm install` at monorepo root and have all workspaces resolve
- Create a new git worktree for development without touching main
- Connect to Supabase and see a fully migrated schema with typed client
- Access the admin panel shell at the Tailscale IP of VPS1
- Deploy code changes by squash-merging to main + `pm2 reload monster-admin`

### Entry point / environment
- Entry point: `http://100.89.11.76:3000` (or configured port) via Tailscale
- Environment: VPS1 (danielmr-hel1), production-like from day 1
- Live dependencies: Supabase Cloud (PostgreSQL), pm2 on VPS1

## Completion Class

- Contract complete means: all packages compile, types generate, migrations apply cleanly
- Integration complete means: admin panel connects to Supabase, auth works, pm2 runs it
- Operational complete means: pm2 restarts on reboot, `deploy.sh` works end-to-end

## Final Integrated Acceptance

To call this milestone complete:
- `cd /home/daniel/monster && pnpm install` succeeds with zero errors
- `supabase gen types --linked` produces valid TypeScript types matching the schema
- `pm2 list` shows `monster-admin` as online
- Admin panel accessible at VPS1 Tailscale IP in browser, login with Supabase Auth works
- Creating a new worktree (`./scripts/new-worktree.sh M001 S06`) works correctly

## Risks and Unknowns

- **Supabase schema complexity** — the extensible schema needs to be thought through before the first migration. A bad schema here cascades through every subsequent milestone.
- **pnpm workspace + Next.js 15 + Astro in same monorepo** — cross-package imports and build configs need careful setup. Known-good pattern exists (shadcn monorepo docs confirm it works).
- **Supabase Auth in Next.js 15 App Router** — SSR cookie handling has specific requirements with the `@supabase/ssr` package. Must use `@supabase/ssr`, not the legacy `@supabase/auth-helpers-nextjs`.

## Existing Codebase / Prior Art

- `/home/daniel/nous/ecosystem.config.js` — pm2 ecosystem file pattern to follow
- `/home/daniel/monster/docs/PRD.md` — full data model specification
- `/home/daniel/monster/docs/VISION.md` — financial model and site type matrix
- `/home/daniel/monster/docs/research/seo-scoring-research.md` — SEO Scorer research (used in M003)
- `.gitignore` — already excludes `.gsd/worktrees/`, `*.code-workspace`

## Relevant Requirements

- R002 — Extensible site type architecture: schema design is the primary deliverable
- R013 — Admin panel on VPS1 via pm2: panel shell must be running by end of milestone
- R014 — Worktree-based development workflow: protocol documented and scripted

## Scope

### In Scope
- pnpm workspace monorepo with all `apps/` and `packages/` directories scaffolded
- Git worktree setup script + protocol documentation
- Supabase schema: full Phase 1 schema (all tables needed through M008) in migrations
- `packages/db`: typed Supabase client + generated types
- `packages/shared`: shared TypeScript types and constants
- Next.js 15 admin panel shell: App Router, Supabase Auth, basic layout + navigation
- pm2 ecosystem entry for `monster-admin`
- Deploy script: `scripts/deploy.sh` (build + pm2 reload)

### Out of Scope / Non-Goals
- Any actual admin panel features (Sites CRUD, Dashboard content, etc.) — those are M002
- Site generator (M003), deployment pipeline (M004), analytics (M005)
- Any content generation or AI agents
- Tailwind component library details (just needs to run, not look polished)

## Technical Constraints

- VPS1: Ubuntu 24.04, Node 22.22.1, pnpm 10.30.3, pm2 6.0.14
- Supabase: Cloud project (not local Docker — use `supabase link` + `supabase db push`)
- Next.js 15 requires React 19 — check for peer dependency conflicts before installing
- `@supabase/ssr` for auth in App Router (NOT `@supabase/auth-helpers-nextjs`)
- Worktree path convention: `/home/daniel/monster-work/gsd/M001/S01`
- pm2 ecosystem file lives at repo root: `ecosystem.config.js`
- Port convention: admin panel on 3001 (avoid conflict with other services — nous uses 3100 for better-copilot)

## Integration Points

- **Supabase Cloud** — schema migrations pushed via CLI, client initialized with env vars `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- **pm2 existing ecosystem** — add `monster-admin` entry to `/home/daniel/nous/ecosystem.config.js` OR create separate `ecosystem.config.js` at monster repo root and register separately with `pm2 start ecosystem.config.js`
- **Tailscale** — no special config needed; panel binds to `0.0.0.0:3001`, accessible via `100.89.11.76:3001`

## Open Questions

- **Separate ecosystem.config.js or extend nous's?** — Recommendation: separate file at `/home/daniel/monster/ecosystem.config.js`. Independent lifecycle, no coupling to nous deploys.
- **Supabase project: new or existing?** — Assumption: new project for BuilderMonster. Confirm before running `supabase link`.
