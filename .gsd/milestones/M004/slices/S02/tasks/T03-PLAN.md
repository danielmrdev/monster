---
estimated_steps: 6
estimated_files: 6
---

# T03: Admin "Deploy" button + deployment status card + Settings UI

**Slice:** S02 — Cloudflare Automation + Deploy Pipeline
**Milestone:** M004

## Description

The user-facing side of S02. Three things need to land:

1. **"Deploy" button** on the site detail page — triggers `DeploySiteJob` via `enqueueSiteDeploy()` server action. Disabled with tooltip when `site.domain` is null.
2. **Deployment card** — shows `sites.status` badge, latest `deployments` row (status, deployed_at, duration, error), and Cloudflare nameservers from `domains.cf_nameservers`. This gives the user visibility into the async deployment pipeline at a glance.
3. **`DeployStatus` polling component** — mirrors `JobStatus.tsx` but polls `getLatestDeployStatus()` for `job_type = 'deploy_site'`, shows current phase from `ai_jobs.payload.phase` while running.
4. **Settings UI** — adds `cloudflare_api_token` (password input) and `vps2_ip` (text input) to the 3-file settings touch pattern (constants → actions → form).

## Steps

1. **Add server actions to `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`:**
   - Import `deployQueue` from `@monster/agents`
   - Add `enqueueSiteDeploy(siteId: string): Promise<{ jobId: string | null; error?: string }>` — exact mirror of `enqueueSiteGeneration` but with `job_type: 'deploy_site'` and enqueues to `deployQueue()` with job name `'deploy-site'`
   - Add `getLatestDeployStatus(siteId: string)` — same structure as `getLatestJobStatus` but filters `job_type = 'deploy_site'`
   - Add `getDeploymentCard(siteId: string)` — fetches: `sites.status` (select `id, status` from sites where `id = siteId`); latest `deployments` row (`status, deployed_at, duration_ms, error, created_at` ordered by `created_at` desc limit 1); `domains` row (`cf_zone_id, cf_nameservers, dns_status` where `site_id = siteId` limit 1). Returns the combined data or nulls. Used for the server-rendered Deployment card.

2. **Create `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx`:**
   - Clone `JobStatus.tsx` — client component, same polling logic (poll every 5s while running/pending, stop on completed/failed)
   - Replace `getLatestJobStatus` with `getLatestDeployStatus`
   - Add phase display: when `job.status === 'running'` and `job.payload?.phase`, show a second line: `Phase: {payload.phase} ({payload.done}/{payload.total})` — this surfaces rsync/caddy/cloudflare step progress
   - Empty state: "No deploy jobs yet."

3. **Update `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`:**
   - Add import: `enqueueSiteDeploy` from `./actions`, `DeployStatus` from `./DeployStatus`
   - Call `getDeploymentCard(id)` in the page body (server-side fetch)
   - Add "Deploy" button in the header button group (next to "Generate Site"):
     - If `site.domain` is null: render a disabled button with `title="Set a domain first"` and `disabled` attribute
     - If `site.domain` is set: `<form action={async () => { 'use server'; await enqueueSiteDeploy(site.id) }}>` with a deploy button styled similarly to "Generate Site" (use a different color — e.g. blue/indigo)
   - Add `<DeployStatus siteId={site.id} />` below the deploy button (inside the header or in a section beneath)
   - Add a "Deployment" card in the page body:
     - `sites.status` badge using the existing badge style (show the full status string: `draft | generating | deploying | dns_pending | ssl_pending | live | paused | error`)
     - Latest deployment row (if exists): status badge, deployed_at date, duration in seconds (`Math.round(duration_ms/1000)s`), error text if failed
     - Cloudflare nameservers (if `domains.cf_nameservers` non-empty): a small list of NS records with a label "Point your domain to these nameservers:" — helps the user know what to configure at their registrar

4. **Update settings constants — `apps/admin/src/app/(dashboard)/settings/constants.ts`:**
   - Add `'cloudflare_api_token'` and `'vps2_ip'` to `SETTINGS_KEYS` array
   - These are `as const` typed automatically

5. **Update settings actions — `apps/admin/src/app/(dashboard)/settings/actions.ts`:**
   - Extend `SaveSettingsSchema` with `cloudflare_api_token: z.string().optional()` and `vps2_ip: z.string().optional()`
   - Extend `SaveSettingsErrors` type with both keys
   - No body changes needed in `saveSettings()` — the `SETTINGS_KEYS` loop handles new keys automatically

6. **Update settings form — `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`:**
   - Add a "Cloudflare" card section with:
     - `cloudflare_api_token`: Label "Cloudflare API Token", `type="password"` input, `MaskedIndicator` showing last-4 chars if configured
     - `vps2_ip`: Label "VPS2 Public IP", `type="text"` input, `MaskedIndicator`
   - Follow the exact pattern of the "VPS2 Deployment" card added in S01

## Must-Haves

- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `enqueueSiteDeploy` server action wired to `deployQueue()` with `job_type: 'deploy_site'`
- [ ] `getLatestDeployStatus` filters by `job_type = 'deploy_site'`
- [ ] "Deploy" button appears in site detail; disabled with tooltip when `site.domain` is null
- [ ] `DeployStatus` client component polls `getLatestDeployStatus`, shows phase progress when running
- [ ] Deployment card shows `sites.status` badge + latest `deployments` row + CF nameservers
- [ ] `cloudflare_api_token` and `vps2_ip` added to `SETTINGS_KEYS` constant
- [ ] `SaveSettingsSchema` and `SaveSettingsErrors` extended with both new keys
- [ ] Cloudflare settings card renders in `/settings` with password input for token + text input for IP

## Verification

```bash
# Build check — no TypeScript errors
pnpm --filter @monster/admin build

# Settings keys check
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/constants.ts

# Action check
grep -E "deploy_site|enqueueSiteDeploy|getLatestDeployStatus|getDeploymentCard" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/actions.ts

# Component imports in page
grep -E "DeployStatus|enqueueSiteDeploy|getDeploymentCard" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx

# DeployStatus component exists
ls apps/admin/src/app/\(dashboard\)/sites/\[id\]/DeployStatus.tsx

# Schema updated
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/actions.ts
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — extend with 3 new server actions
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — clone for `DeployStatus.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — add button + card + component
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — 3-file settings touch (D034 pattern)
- `packages/agents/src/index.ts` — `deployQueue` exported here (T02 output); `'use server'` files can only export async functions (D034) — `deployQueue` is imported in the action, not re-exported
- T02 output: `deployQueue()` singleton available from `@monster/agents`; `getLatestDeployStatus` structure mirrors `getLatestJobStatus`

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueSiteDeploy`, `getLatestDeployStatus`, `getDeploymentCard` added
- `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx` — new client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Deploy button + Deployment card + DeployStatus component
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — `cloudflare_api_token`, `vps2_ip` added
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — schema + errors extended
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Cloudflare card added

## Observability Impact

**New signals introduced by this task:**

- `ai_jobs` rows with `job_type = 'deploy_site'` — created by `enqueueSiteDeploy()` before enqueue; visible immediately in admin panel via `DeployStatus` component and inspectable via Supabase
- `ai_jobs.payload.phase` — surfaces per-step deploy progress (`queued → deploy → rsync → caddy → cloudflare`) in the `DeployStatus` component; visible as `Phase: X (done/total)` when job is running
- Admin `/sites/[id]` Deployment card — SSR snapshot of `sites.status` + latest `deployments` row + `domains.cf_nameservers`; refreshes on page load

**Failure state visibility:**
- If `enqueueSiteDeploy()` fails to enqueue (BullMQ error), the `ai_jobs` row is immediately marked `status='failed'` with `error` set — `DeployStatus` will show `Failed` on next poll
- If `DeploySiteJob` fails mid-run, `ai_jobs.payload.phase` shows the step where failure occurred; `deployments.error` contains the infra error message — both visible in Deployment card on page refresh
- `sites.status = 'error'` is the terminal failure state after SSL poll exhaustion — visible in the pipeline status badge

**How a future agent inspects this task:**
```bash
# Check deploy job state for a site
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('ai_jobs').select('id,status,error,payload').eq('job_type','deploy_site').order('created_at',{ascending:false}).limit(3);
console.log(JSON.stringify(data, null, 2));
"

# Settings keys present
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/constants.ts

# Deployment card data for a site
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const [site, deployment, domain] = await Promise.all([
  db.from('sites').select('id,status').limit(1).single(),
  db.from('deployments').select('status,deployed_at,error').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('domains').select('cf_nameservers,dns_status').limit(1).maybeSingle(),
]);
console.log({ site: site.data, deployment: deployment.data, domain: domain.data });
"
```
