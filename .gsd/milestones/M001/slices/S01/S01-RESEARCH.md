# S01: Monorepo + Worktree Scaffold — Research

**Date:** 2026-03-13
**Requirements covered:** R014 (worktree workflow), partial R013 (pm2 skeleton)

## Summary

S01 creates the structural skeleton: pnpm workspace config, per-package `package.json`/`tsconfig.json` stubs, worktree helper scripts, a pm2 ecosystem skeleton, and `.env.example`. No implementation code is written — just the scaffold that all downstream slices build on.

The main repo at `/home/daniel/monster/` has no root `package.json` or `pnpm-workspace.yaml` yet — clean slate. The nous monorepo (`/home/daniel/nous/`) provides a direct pattern to follow: `pnpm-workspace.yaml` with `apps/*` + `packages/*` globs, `@scope/package-name` naming, and a flat `ecosystem.config.js` at repo root. The worktree convention (`/home/daniel/monster-work/gsd/<M>/<S>`) is new and requires creating the parent directory on first use.

One concrete blocker surfaced: **port 3001 is occupied** by `nous-core` (bound to `127.0.0.1:3001`). Next.js binds to `0.0.0.0` by default, which conflicts on Linux even with different source addresses. **Port 3004 is free and recommended for monster-admin.** This should be noted in `ecosystem.config.js` and updated in the context docs.

## Recommendation

Build the scaffold with `pnpm 10` catalogs for shared version pinning, a `tsconfig.base.json` at the root that all packages extend, and lean `package.json` stubs (name + version + scripts placeholder) in every workspace directory. The worktree script is the highest-complexity deliverable — it needs to handle branch-already-exists, worktree-already-exists, and parent-dir-creation gracefully. The squash-merge script is straightforward. No Turborepo — D012 explicitly rules it out.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Port conflict diagnosis | `ss -tlnp` (already done) | Confirmed 3001 is taken, 3004 is free |
| pnpm workspace file syntax | Exact pattern from `/home/daniel/nous/pnpm-workspace.yaml` | Same structure: `apps/*` + `packages/*` |
| pm2 ecosystem pattern | `/home/daniel/nous/ecosystem.config.js` | Has the exact shape needed: `name`, `script`, `cwd`, `env`, log paths |
| Git worktree add idempotency | `--force` flag + explicit branch creation with `git branch -f` | Handles re-runs without failing |

## Existing Code and Patterns

- `/home/daniel/nous/ecosystem.config.js` — pm2 config with name, script, cwd, log paths, env. Use same shape for `monster-admin` entry. Key fields: `script: 'node_modules/.bin/next'`, `args: 'start'`, `cwd: '/home/daniel/monster/apps/admin'`.
- `/home/daniel/nous/pnpm-workspace.yaml` — `packages: ['apps/*', 'packages/*']` — copy verbatim.
- `/home/daniel/nous/apps/better-copilot/tsconfig.json` — Next.js 15 tsconfig pattern: `moduleResolution: Bundler`, `plugins: [{ name: "next" }]`, `paths: { "@/*": ["./*"] }`.
- `/home/daniel/nous/apps/core/tsconfig.json` — Node package tsconfig: `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `declaration: true`.
- `/home/daniel/nous/package.json` — Root workspace `package.json` shape: private, workspaces field unused (handled by `pnpm-workspace.yaml`), top-level dev deps only.

## Constraints

- **Node 22.22.1, pnpm 10.30.3, pm2 6.0.14** — exact versions on VPS1. `packageManager` field in root `package.json` should pin `pnpm@10.30.3` for corepack awareness.
- **Port 3001 is taken** by `nous-core` (127.0.0.1:3001). Port 3003 taken by `better-copilot/panel`. Port 3100 taken by `better-copilot` API. **Use 3004** for monster-admin.
- **No Turborepo** (D012) — use `pnpm --filter` for targeted builds.
- **pnpm 10 hoisting** — `shamefully-hoist=false` by default. If Next.js or Astro have issues finding hoisted deps, add `.npmrc` with `public-hoist-pattern[]=*` for problematic packages. Flag this for S04 when Next.js is actually installed.
- **supabase CLI not installed** — `npm show supabase` shows version `2.78.1`. S02 will need to install it (either as dev dep in root or system binary). S01 only needs the `packages/db/supabase/migrations/` directory to exist.
- **Main repo already on `gsd/M001/S01` branch** — this is the current development state. The worktree script should handle the "branch already checked out in main worktree" case (git returns `fatal: '<branch>' is already checked out`) — use `--force` to allow it.
- **`/home/daniel/monster-work/` does not exist** — the worktree script must `mkdir -p` the target path's parent before calling `git worktree add`.
- **Next.js version** — latest stable is `15.5.9` in the 15.x line (16.x is out but spec says 15). Use `15.5.9`. React 19 is required (`react: "^19.0.0"`, `react-dom: "^19.0.0"`).
- **Tailwind v4** — no `tailwind.config.js`. Config moves to CSS `@theme {}` blocks. PostCSS plugin: `@tailwindcss/postcss` (not `tailwindcss` directly in postcss.config).
- **`@supabase/ssr` 0.9.0** requires `@supabase/supabase-js ^2.97.0`. Both go in `packages/db`, not the root.

## Common Pitfalls

- **Forgetting `"private": true` in workspace package.json** — pnpm will try to publish them. All workspace packages must have `"private": true`.
- **tsconfig `paths` in base vs app tsconfig** — the `@monster/*` path aliases must be in the *app's* `tsconfig.json` (not just the base), because `tsc` and Next.js each resolve paths from the config closest to the file. Set in each app that consumes packages.
- **`git worktree add` with an already-checked-out branch** — git errors with `fatal: 'gsd/M001/S01' is already checked out at '/home/daniel/monster'`. The script must use `--force` flag or detect the case and skip gracefully.
- **Worktree missing pnpm install** — after `git worktree add`, the worktree shares `.git` but has its own `node_modules`-less working tree. The script should remind the user to run `pnpm install` inside the new worktree (or do it automatically).
- **ecosystem.config.js next start args** — `next start -p 3004` must be passed as `args` not embedded in `script`. Or use `env: { PORT: '3004' }`. The env approach is cleaner and matches Next.js's PORT env var convention.
- **Missing `scripts/` directory** — `chmod +x` on `.sh` files must be explicit in the creation step, not assumed.

## Port Allocation (VPS1 Current State)

| Port | Service | Bind |
|------|---------|------|
| 80, 443 | Caddy | 0.0.0.0 |
| 3001 | nous-core (HTTP) | 127.0.0.1 |
| 3002 | nous-core (alt) | 127.0.0.1 |
| 3003 | better-copilot/panel (Next.js) | * |
| 3100 | better-copilot API | * |
| **3004** | **monster-admin (reserved)** | 0.0.0.0 |

## Open Risks

- **pnpm 10 + Next.js 15 hoisting**: `shamefully-hoist=false` is the default in pnpm 10. Next.js and its deps generally work, but shadcn/ui component resolution across workspace boundaries may need `public-hoist-pattern` tuning. This won't surface until S04 when Next.js is actually installed — flag it as a known risk there.
- **`tsconfig.base.json` composite references**: if packages use `composite: true` for incremental builds, referencing them from `apps/admin` requires explicit `references[]` in the app tsconfig. Keep it simple in S01 (no composite) and revisit in S03 when packages have actual source.
- **Astro + pnpm workspace imports**: Astro has known issues with pnpm's strict node_modules in some versions. This is an S03/M003 concern, not S01, but the directory structure should not pre-assume Astro's build output location conflicts with `dist/` in packages.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pnpm monorepo | none | none found — standard knowledge sufficient |
| Next.js 15 | none installed | check `npx skills find "next.js"` before S04 |
| Supabase Auth SSR | none installed | check before S04 |

## Package Scope and Names

| Directory | Package name | Description |
|-----------|-------------|-------------|
| `apps/admin` | `@monster/admin` | Next.js 15 admin panel |
| `apps/generator` | `@monster/generator` | Astro.js site generation engine |
| `packages/db` | `@monster/db` | Supabase schema, migrations, typed client |
| `packages/shared` | `@monster/shared` | Shared types + constants |
| `packages/agents` | `@monster/agents` | AI agent definitions |
| `packages/analytics` | `@monster/analytics` | Tracking script + event processing |
| `packages/domains` | `@monster/domains` | Spaceship API client |
| `packages/seo-scorer` | `@monster/seo-scorer` | On-page SEO scoring engine |
| `packages/deployment` | `@monster/deployment` | VPS deployment service |

## `.env.example` Variables

All env vars the system will eventually need (S01 creates the example file; actual values set per-slice):

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Upstash Redis (BullMQ)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# DataForSEO
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=

# Spaceship (domain registrar)
SPACESHIP_API_KEY=
SPACESHIP_API_SECRET=

# Cloudflare
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=

# Hetzner (VPS management)
HETZNER_API_TOKEN=

# VPS2 (sites server)
VPS2_HOST=
VPS2_SSH_USER=daniel
VPS2_SITES_PATH=/var/www/sites

# Amazon Associates
AMAZON_AFFILIATE_TAG_ES=

# Unsplash (stock images)
UNSPLASH_ACCESS_KEY=

# App
PORT=3004
NODE_ENV=production
```

## Sources

- Port conflict discovered by `ss -tlnp` on VPS1 (this machine)
- pm2 ecosystem pattern from `/home/daniel/nous/ecosystem.config.js`
- pnpm workspace pattern from `/home/daniel/nous/pnpm-workspace.yaml`
- Next.js 15.x latest: `15.5.9` (confirmed via `npm show next`)
- `@supabase/ssr` 0.9.0 peer dep requires `@supabase/supabase-js ^2.97.0`
- Tailwind v4 PostCSS setup: `@tailwindcss/postcss` (confirmed via npm registry)
