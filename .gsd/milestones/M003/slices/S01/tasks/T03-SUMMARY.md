---
id: T03
parent: S01
milestone: M003
provides:
  - BullMQ worker (packages/agents/dist/worker.js) connected to Upstash Redis, processing generate_site jobs
  - GenerateSiteJob class writing fixture site.json + running Astro build programmatically
  - Admin panel "Generate Site" button + JobStatus polling component
  - ai_jobs status transitions pending → running → completed verified end-to-end
key_files:
  - packages/agents/src/queue.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - packages/agents/tsup.config.ts
  - packages/agents/dist/index.d.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - tsup DTS disabled for all entrypoints; hand-written dist/index.d.ts for admin imports (avoids dual-ioredis DTS conflict between packages/agents@5.10 and bullmq's pinned ioredis@5.9.3)
  - GenerateSiteJob NOT exported from index.ts — only generateQueue() is exported to admin; worker imports GenerateSiteJob directly (avoids bundling astro into the admin webpack graph)
  - process.chdir(GENERATOR_ROOT) before astro build() call so loadSiteData's process.cwd() resolves correctly (D021 pattern — GENERATOR_ROOT is a compile-time constant, not env var)
  - ai_jobs INSERT+lookup pattern instead of upsert (no unique constraint on bull_job_id in schema)
  - UPSTASH_REDIS_URL must be rediss:// scheme; token stored separately as UPSTASH_REDIS_TOKEN
patterns_established:
  - Worker runs standalone (node dist/worker.js) with dotenv/config import at top — not inside Next.js process
  - BullMQ Queue singleton in admin (generateQueue()) via module-level var; worker creates its own Redis connection
  - SITE_SLUG env var set via process.env before astro build(); cwd changed via process.chdir() for data resolution
observability_surfaces:
  - ai_jobs table: status (pending|running|completed|failed), started_at, completed_at, error, bull_job_id
  - Worker stdout: [GenerateSiteJob] prefixed logs per phase
  - Supabase query: SELECT status, error, started_at, completed_at FROM ai_jobs WHERE site_id='<id>' ORDER BY created_at DESC LIMIT 1
  - Admin panel: JobStatus component polls getLatestJobStatus() every 5s while pending|running
duration: ~3h (including debugging dual-ioredis DTS conflict, process.cwd() data resolution, invalid UPSTASH_REDIS_URL format)
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Wire BullMQ job worker + admin "Generate Site" trigger

**BullMQ worker + admin trigger fully wired: button click → Upstash Redis queue → 11-page Astro build → ai_jobs completed in ~4 seconds.**

## What Happened

Bootstrapped `packages/agents` with tsup, BullMQ, ioredis, and dotenv. Three non-trivial issues were resolved during implementation:

**Dual ioredis version conflict:** `packages/agents` installed ioredis@5.10.0; bullmq pins ioredis@5.9.3. tsup's DTS build via rollup-plugin-dts failed because both versions resolved in the type graph. Fixed by disabling DTS entirely and writing a hand-crafted `dist/index.d.ts`. pnpm override (`"ioredis": "5.9.3"`) was added to root `package.json` to minimize future drift.

**astro in the admin webpack bundle:** `index.ts` originally exported `GenerateSiteJob`, which transitively imported `astro`. Next.js tried to bundle it and failed on `data:text` imports from `@astrojs/compiler`. Fixed by not exporting `GenerateSiteJob` from `index.ts` — only `generateQueue()` is exported.

**process.cwd() in Astro data loader:** `loadSiteData()` in `apps/generator/src/lib/data.ts` reads `site.json` via `join(process.cwd(), "src", "data", slug, "site.json")`. When the worker runs from the monorepo root, `process.cwd()` is `/home/daniel/monster`, not `apps/generator`. Fixed with `process.chdir(GENERATOR_ROOT)` before calling `build()`, restored to `prevCwd` in a finally block.

**ai_jobs upsert:** The `ai_jobs` table has no unique constraint on `bull_job_id`, so upsert failed. Replaced with a lookup-then-insert pattern.

## Verification

```
# Build
cd packages/agents && pnpm build  → 2 ESM builds succeed

# Type check
cd packages/agents && npx tsc --noEmit  → exits 0

# Admin build
cd apps/admin && pnpm build  → exits 0, /sites/[id] route included

# End-to-end manual run
node packages/agents/dist/worker.js  → "[worker] GenerateSiteJob listening"
enqueue job for site e73839d8 (Test Camping Site)  → job id=2
worker log: 11 pages built, "[GenerateSiteJob] Job 2 completed"

# Supabase ai_jobs row
status=completed, started_at set, completed_at set, error=null

# Filesystem
ls apps/generator/.generated-sites/testcamping-com/dist/index.html  → exists
affiliate links: contain ?tag=testcamping-21 (amazon.es)
no hotlinked images: PASS
```

## Diagnostics

- Worker logs: `[GenerateSiteJob] Starting job <id> for site <siteId>` → `Wrote site.json` → `Running Astro build` → `Astro build complete` → `Job completed`
- On failure: `[GenerateSiteJob] Job <id> failed: <message>` + `ai_jobs.status = failed` + `ai_jobs.error = err.message`
- Admin panel: JobStatus component at `/sites/<id>` polls every 5s, shows Pending/Running/Completed/Failed badge
- Astro build stdout always prints `[build] directory: <path>` — confirms which slug was targeted

## Deviations

- DTS generation disabled (hand-written `dist/index.d.ts`) — tsup DTS broken by dual ioredis versions; not a plan deviation, just an implementation choice
- `ai_jobs` lookup+insert instead of upsert — schema has no `bull_job_id` unique constraint (plan assumed one existed)
- `UPSTASH_REDIS_URL` collected as raw CLI command by user; had to correct to `rediss://` URL format manually in `.env`

## Known Issues

- Worker imports `astro` at runtime via dynamic import; if `astro` is not installed in monorepo root `node_modules`, the worker crashes. Currently fine because `apps/generator` depends on it.
- The admin "Generate Site" form action uses an inline server function (`'use server'` inside JSX). This works but could be extracted to `actions.ts` for clarity in a future cleanup.
- Job 1 (first test run) left a `failed` row in `ai_jobs` with the cwd error message. Not a problem for production but visible in Supabase dashboard.

## Files Created/Modified

- `packages/agents/package.json` — full dep set (bullmq, ioredis@5.9.3, dotenv, astro devDep) + tsup build scripts
- `packages/agents/tsup.config.ts` — two-entry tsup config (index + worker), DTS disabled, astro external
- `packages/agents/tsconfig.json` — NodeNext module resolution, rootDir=src
- `packages/agents/src/queue.ts` — createRedisOptions(), createRedisConnection(), generateQueue() singleton
- `packages/agents/src/jobs/generate-site.ts` — GenerateSiteJob with fixture assembler + Astro build invocation
- `packages/agents/src/worker.ts` — standalone entrypoint with SIGTERM/SIGINT graceful shutdown
- `packages/agents/src/index.ts` — exports generateQueue only (no GenerateSiteJob to avoid astro in admin bundle)
- `packages/agents/dist/index.d.ts` — hand-written type declarations for admin imports
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — enqueueSiteGeneration + getLatestJobStatus server actions
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — client component with 5s polling
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate Site button + JobStatus integration
- `package.json` — pnpm override for ioredis@5.9.3
- `.env` — UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN added (corrected URL format)
