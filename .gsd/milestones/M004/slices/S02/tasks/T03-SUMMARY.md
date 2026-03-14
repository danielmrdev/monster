---
id: T03
parent: S02
milestone: M004
provides:
  - enqueueSiteDeploy() server action (creates ai_jobs row + enqueues to deployQueue)
  - getLatestDeployStatus() server action (polls ai_jobs for job_type='deploy_site')
  - getDeploymentCard() server action (SSR fetch: sites.status + latest deployments row + domains row)
  - DeployStatus.tsx client component (polls every 5s while pending/running, shows phase progress)
  - Deploy button in site detail page (disabled with tooltip when site.domain is null)
  - Deployment card on site detail (pipeline status badge + latest deployment + CF nameservers)
  - cloudflare_api_token and vps2_ip in SETTINGS_KEYS + SaveSettingsSchema + SaveSettingsErrors
  - Cloudflare card in settings form (password input for token, text input for VPS2 IP)
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - getDeploymentCard uses Promise.all for parallel Supabase fetches (sites + deployments + domains) — no sequential waterfall
  - Deploy button rendered as disabled <button> (not form) when site.domain is null — avoids server action in unreachable state
  - DeployStatus is a direct clone of JobStatus with job_type filter changed; phase display added only for running status
  - Build failed on first attempt due to stale .next cache (SelectQueryError false positive); fixed by rm -rf apps/admin/.next before rebuild
patterns_established:
  - 3-file settings touch: constants.ts → actions.ts (schema + errors) → settings-form.tsx (UI card) — D034 pattern
  - Parallel Promise.all for SSR data fetches in page.tsx when results are independent
observability_surfaces:
  - ai_jobs rows with job_type='deploy_site' — created pre-enqueue, visible immediately in Supabase + DeployStatus component
  - ai_jobs.payload.phase — surfaced as "Phase: X (done/total)" in DeployStatus when job is running
  - Deployment card on /sites/[id] — SSR snapshot of sites.status + deployments row + domains.cf_nameservers
  - "grep deploy_site packages/agents/src/worker.ts" to verify job registration
duration: ~35m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Admin "Deploy" button + deployment status card + Settings UI

**Wired the user-facing deploy pipeline: Deploy button, DeployStatus polling component, Deployment card, and Cloudflare/VPS2 settings — admin build exits 0.**

## What Happened

Six files touched in order per the plan:

1. **`actions.ts`** — Added `deployQueue` import alongside `generateQueue`. Added `enqueueSiteDeploy()` (mirrors `enqueueSiteGeneration`, uses `job_type: 'deploy_site'` and `deployQueue()`). Added `getLatestDeployStatus()` (same as `getLatestJobStatus` but filters `job_type = 'deploy_site'`). Added `getDeploymentCard()` using `Promise.all` for parallel fetches of `sites`, `deployments`, and `domains` tables.

2. **`DeployStatus.tsx`** — Cloned `JobStatus.tsx`. Added phase progress display: when `job.status === 'running'` and `payload.phase` is set, shows `Phase: X (done/total)`. Empty state is "No deploy jobs yet." Polling stops on `completed` or `failed`.

3. **`page.tsx`** — Replaced the single `seoScores` fetch with a `Promise.all` that also calls `getDeploymentCard()`. Added Deploy button next to Generate Site: if `site.domain` is null, renders a `disabled` button with `title="Set a domain first"`; otherwise renders a form action calling `enqueueSiteDeploy`. Added a full Deployment card section: pipeline status badge, latest deployment row (status/deployed_at/duration_ms/error), CF nameservers list with "Point your domain to these nameservers:" label. `<DeployStatus siteId={site.id} />` inside the deployment card for live polling.

4. **`settings/constants.ts`** — Added `'cloudflare_api_token'` and `'vps2_ip'` to `SETTINGS_KEYS`. The `saveSettings()` body requires no changes — it loops over `SETTINGS_KEYS` automatically.

5. **`settings/actions.ts`** — Extended `SaveSettingsSchema` with both optional keys. Extended `SaveSettingsErrors` type with both keys.

6. **`settings/settings-form.tsx`** — Added "Cloudflare" card following the exact VPS2 Deployment card pattern: password input for `cloudflare_api_token` with `MaskedIndicator`, text input for `vps2_ip` with `MaskedIndicator`. Description note about required Zone:Edit permissions.

## Verification

```
pnpm --filter @monster/admin build   → exit 0 (✓, after rm -rf apps/admin/.next)
pnpm --filter @monster/domains build → exit 0 (✓)
pnpm --filter @monster/domains typecheck → exit 0 (✓)
pnpm --filter @monster/agents build  → exit 0 (✓)

grep cloudflare_api_token|vps2_ip constants.ts → both present (✓)
grep deploy_site|enqueueSiteDeploy|getLatestDeployStatus|getDeploymentCard actions.ts → all present (✓)
grep DeployStatus|enqueueSiteDeploy|getDeploymentCard page.tsx → all present (✓)
ls DeployStatus.tsx → exists (✓)
grep cloudflare_api_token|vps2_ip settings/actions.ts → schema + errors both (✓)

node -e "import('.../domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))" → function (✓)
grep GenerateSiteJob|DeploySiteJob|SslPollerJob worker.ts → all 3 registered (✓)
grep deployQueue|sslPollerQueue queue.ts → both exported (✓)
ls ...migrations/20260314000002_cf_nameservers.sql → present (✓)
grep cf_nameservers supabase.ts → 3 matches (✓)
```

## Diagnostics

```bash
# Check deploy job state after clicking Deploy button
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('ai_jobs').select('id,status,error,payload').eq('job_type','deploy_site').order('created_at',{ascending:false}).limit(3);
console.log(JSON.stringify(data, null, 2));
"
# Expected: newest row has status='pending'|'running'|'completed'|'failed', payload.phase tracks steps

# Settings keys present
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/constants.ts

# Deployment card data
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('deployments').select('status,deployed_at,error').order('created_at',{ascending:false}).limit(1).maybeSingle();
console.log(JSON.stringify(data, null, 2));
"
```

## Deviations

- First build failed with `SelectQueryError` on `cf_nameservers` — turned out to be a stale `.next` cache, not a real type error. Cleared with `rm -rf apps/admin/.next`, rebuilt cleanly. No code change needed.
- `page.tsx` data fetches refactored from sequential (`seoScores` then `getDeploymentCard`) to `Promise.all` — minor improvement not in plan but straightforward.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added `enqueueSiteDeploy`, `getLatestDeployStatus`, `getDeploymentCard`; added `deployQueue` import
- `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx` — new client polling component (clone of JobStatus + phase display)
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Deploy button, Deployment card, DeployStatus component, parallel data fetch
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added `cloudflare_api_token`, `vps2_ip`
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — extended schema + error type
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Cloudflare card with password + text inputs
- `.gsd/milestones/M004/slices/S02/tasks/T03-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
