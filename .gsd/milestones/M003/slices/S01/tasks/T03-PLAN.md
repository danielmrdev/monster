---
estimated_steps: 7
estimated_files: 8
---

# T03: Wire BullMQ job worker + admin "Generate Site" trigger

**Slice:** S01 — Astro Templates + Build Pipeline
**Milestone:** M003

## Description

This task closes the slice's demo condition: admin panel button click → BullMQ job → `ai_jobs` progress tracking → real `dist/` on disk. It also bootstraps `packages/agents` as a real TypeScript package with build tooling, so S02 and S03 can extend it incrementally.

BullMQ requires a Redis backend. We use Upstash Redis (managed, HTTP-compatible) since no local Redis is running. The worker runs as a standalone Node.js process (`node dist/worker.js`) — not inside Next.js. This matches D002 (pm2-managed processes) and avoids coupling the worker lifecycle to the admin panel. The pm2 ecosystem entry for the worker is deferred to S04; for S01 we just run it manually during verification.

The S01 worker assembles fixture data (same shape as T02's `fixture/site.json`) rather than querying DataForSEO — real product fetch is S02's job. The `site_id` from BullMQ job payload is used to read the site row from Supabase, which drives the `site.json` written to `src/data/<slug>/`.

`ai_jobs` polling in the admin uses a client component that auto-refreshes every 5 seconds while status is `pending` or `running`. No Supabase real-time subscriptions yet (D037).

## Steps

1. **Bootstrap `packages/agents`.** Add `bullmq`, `ioredis`, `@monster/db`, `@monster/shared` to `packages/agents/package.json`. Configure `tsup` build: `entry: ['src/index.ts', 'src/worker.ts']`, `format: 'esm'`, `dts: true`. Add `build` and `type-check` scripts.

2. **Write `src/queue.ts`.** Create a `Queue` named `generate` using an ioredis `IORedis` connection (Upstash requires `enableOfflineQueue: false`, `maxRetriesPerRequest: null`). Export `generateQueue`. Read `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` from `process.env` inside the factory — not at module scope (D021).

3. **Write `src/jobs/generate-site.ts`.** `GenerateSiteJob` class with a `register()` method that creates a `Worker('generate', handler, { connection })`. Handler logic:
   - Read site from Supabase: `createServiceClient().from('sites').select('*').eq('id', job.data.siteId).single()`
   - Upsert `ai_jobs` row: `{ bull_job_id: job.id, job_type: 'generate_site', site_id, status: 'running', started_at: new Date().toISOString(), payload: { phase: 'build', slug: site.domain ?? site.id } }`
   - Assemble fixture `SiteData` from site row (S01 stub): derive 2 placeholder categories and 4 placeholder products from site fields; no DataForSEO call yet.
   - `fs.mkdirSync` the `apps/generator/src/data/<slug>/` directory; `fs.writeFileSync` `site.json`.
   - Call Astro `build()` programmatically: `import { build } from 'astro'` with `{ root: GENERATOR_ROOT }` and `process.env.SITE_SLUG = slug` set before the call. `GENERATOR_ROOT` = absolute path to `apps/generator/` relative to the monorepo root (use `path.resolve(__dirname, '../../apps/generator')` or a constant).
   - Update `ai_jobs` to `status: 'completed', completed_at: new Date().toISOString()`.
   - try/catch around all steps: on error, update `ai_jobs` to `status: 'failed', error: err.message`.

4. **Write `src/worker.ts`** — imports `GenerateSiteJob`, calls `register()`, logs `[worker] GenerateSiteJob listening`. This is the entrypoint for `node dist/worker.js`.

5. **Collect Upstash Redis credentials.** Use `secure_env_collect` to add `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` to `.env`.

6. **Wire admin panel.** In `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` add server action `enqueueSiteGeneration(siteId: string)`: imports `generateQueue` from `@monster/agents`, calls `generateQueue.add('generate-site', { siteId })`, then inserts an `ai_jobs` row with `status: 'pending'`. In `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`: add "Generate Site" `<button>` that calls `enqueueSiteGeneration`. Below it, render a `<JobStatus siteId={site.id} />` client component. Write `JobStatus` as a client component in `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx`: fetches the latest `ai_jobs` row for the site on mount, polls every 5 seconds while status is `pending|running`, renders a badge (`Pending`, `Running`, `Completed`, `Failed`) + `started_at`/`completed_at` timestamps. Stop polling when `completed` or `failed`.

7. **Build and verify end-to-end.** `pnpm --filter @monster/agents build` exits 0. `tsc --noEmit` in `packages/agents`. Start worker: `node packages/agents/dist/worker.js`. Navigate to a real site detail page in admin panel, click "Generate Site". Watch `ai_jobs` in Supabase dashboard — status transitions `pending → running → completed`. Confirm `.generated-sites/<slug>/dist/index.html` exists.

## Must-Haves

- [ ] `packages/agents` builds with `tsup` to `dist/` with ESM + type declarations
- [ ] `tsc --noEmit` exits 0 in `packages/agents`
- [ ] BullMQ worker connects to Upstash Redis without error
- [ ] `GenerateSiteJob` writes fixture `site.json` to `apps/generator/src/data/<slug>/` before calling `build()`
- [ ] `ai_jobs` row transitions: `pending → running → completed` (or `failed` with `error` populated)
- [ ] Admin panel "Generate Site" button dispatches job; `JobStatus` component shows status badge updating without full page reload
- [ ] Built `dist/` exists at `.generated-sites/<slug>/dist/` after job completes

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `cd packages/agents && tsc --noEmit` exits 0
- Manual: click "Generate Site" in admin panel → `ai_jobs` shows `completed` in Supabase → `ls apps/generator/.generated-sites/<slug>/dist/index.html` shows file exists
- `grep -rq "amazon.com" apps/generator/.generated-sites/<slug>/dist/ || echo "no hotlinked images"` (fixture data has no product images → passes)

## Observability Impact

- Signals added: `ai_jobs.status` transitions, `ai_jobs.error` on failure, `[GenerateSiteJob]` prefixed stdout logs per phase
- How a future agent inspects this: `SELECT status, error, started_at, completed_at FROM ai_jobs WHERE site_id = '<id>' ORDER BY created_at DESC LIMIT 1;` in Supabase, or read from admin panel `JobStatus` component
- Failure state exposed: `ai_jobs.error` contains `err.message`; `ai_jobs.status = 'failed'`; worker process exits on uncaught error (pm2 restarts it in production)

## Inputs

- `apps/generator/astro.config.ts` + all page templates — complete from T02; `build()` must work before wiring the job
- `packages/db/src/index.ts` — `createServiceClient()`, `Database` types
- `packages/shared/src/index.ts` — `AMAZON_MARKETS`, `SiteTemplate`, etc.
- Supabase `ai_jobs` table — already in schema from M001; fields: `bull_job_id`, `job_type`, `site_id`, `status`, `started_at`, `completed_at`, `error`, `payload`
- `.env` — Supabase vars already present; Upstash vars added in this task

## Expected Output

- `packages/agents/package.json` — full dep set + tsup build
- `packages/agents/src/queue.ts` — BullMQ Queue connected to Upstash
- `packages/agents/src/jobs/generate-site.ts` — GenerateSiteJob worker
- `packages/agents/src/worker.ts` — standalone worker entrypoint
- `packages/agents/src/index.ts` — exports `generateQueue`, `GenerateSiteJob`
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueSiteGeneration` server action
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — "Generate Site" button + JobStatus integration
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — client component with 5s poll
- `.env` — `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` added
