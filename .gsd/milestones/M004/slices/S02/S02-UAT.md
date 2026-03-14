# S02: Cloudflare Automation + Deploy Pipeline — UAT

**Milestone:** M004
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven contract checks + live-runtime integration + human-experience verification)
- Why this mode is sufficient: Contract and structural checks are fully automatable and prove the codebase is wired correctly. Integration tests require live credentials (Cloudflare API token, VPS2 IP) and real NS propagation — those are human-verified steps that cannot be faked. The UAT separates what can be confirmed immediately from what requires the live stack.

## Preconditions

1. All three package builds exit 0: `pnpm --filter @monster/domains build`, `pnpm --filter @monster/agents build`, `pnpm --filter @monster/admin build`
2. Admin panel running on VPS1 (pm2 `monster-admin` online, port 3004)
3. BullMQ worker running (`node packages/agents/dist/worker.js` or pm2 equivalent)
4. DB migration `20260314000002_cf_nameservers.sql` applied to Supabase Cloud (via dashboard SQL editor or `supabase db push`)
5. Admin Settings populated:
   - `cloudflare_api_token` — valid CF token with Zone:Edit + Zone:Read permissions
   - `vps2_ip` — VPS2 public IP address (the A record target)
   - `vps2_host`, `vps2_user`, `vps2_sites_root` — (carried over from S01)
6. At least one site in Supabase with `domain` set to a real domain name (e.g. `test-site.example.com`) and a successful prior generation (Astro dist present in `.generated-sites/<slug>/dist/`)

## Smoke Test

```bash
# 1. Confirm CloudflareClient is exported correctly
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))"
# Expected: function

# 2. Confirm worker registers all three jobs
grep -E "GenerateSiteJob|DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts | grep "console.log"
# Expected: 3 lines confirming each queue listener

# 3. Confirm settings keys present
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/constants.ts
# Expected: both lines present

# 4. Confirm migration file present
ls packages/db/supabase/migrations/20260314000002_cf_nameservers.sql
# Expected: file present

# 5. Confirm cf_nameservers in Supabase types
grep "cf_nameservers" packages/db/src/types/supabase.ts
# Expected: 3 matches (Row, Insert, Update)
```

## Test Cases

### 1. Settings UI — Cloudflare card renders and saves

1. Navigate to `http://localhost:3004/settings` (or VPS1 Tailscale URL)
2. Scroll to the "Cloudflare" card
3. **Expected:** Card renders with two inputs — a password field labeled `cloudflare_api_token` and a text field labeled `vps2_ip`. Description note mentions "Zone:Edit permissions" required.
4. Enter a test value in `cloudflare_api_token` and `vps2_ip`, click Save
5. **Expected:** Success banner appears. Reload the page — `MaskedIndicator` shows "is configured" for `cloudflare_api_token` (masked), `vps2_ip` shows its value (plain text).

### 2. Deploy button renders correctly based on domain presence

1. Navigate to a site detail page where `site.domain` is NULL (or create a test site without a domain)
2. **Expected:** "Deploy" button is visible but disabled (grayed out), with `title="Set a domain first"` visible on hover.
3. Navigate to a site detail page where `site.domain` is set to a valid domain
4. **Expected:** "Deploy" button is enabled and clickable.

### 3. Deploy button enqueues job — ai_jobs row created

1. On a site with a valid domain and generated dist, click "Deploy"
2. **Expected:** Page reloads (or shows confirmation). No error thrown.
3. Check Supabase `ai_jobs` table:
   ```sql
   SELECT id, status, job_type, payload FROM ai_jobs
   WHERE job_type = 'deploy_site'
   ORDER BY created_at DESC LIMIT 1;
   ```
4. **Expected:** Row present with `job_type='deploy_site'`, `status='pending'` or `status='running'`, `payload` includes `siteId`.

### 4. DeployStatus component polls and displays progress

1. After clicking Deploy (from Test 3), wait on the site detail page without reloading
2. **Expected:** `DeployStatus` component (below the Deploy button / inside Deployment card) updates automatically every 5 seconds, showing the current status. If job is `running`, a phase label is shown (e.g. "Phase: deploy (1/3)").
3. Once job completes: component shows `completed` or `failed` state. Polling stops.
4. **Expected:** No infinite polling loop — component becomes static after terminal state.

### 5. Full deploy job pipeline — Supabase state transitions

Requires: live worker running, live Cloudflare API token, live VPS2 reachable over Tailscale SSH.

1. Click "Deploy" on a site with a valid domain
2. Monitor `sites.status` in Supabase:
   ```sql
   SELECT status, updated_at FROM sites WHERE id = '<site-id>';
   ```
3. **Expected sequence:** `deploying` appears first, then `dns_pending` after CF zone + A record are created. (Transitions happen in seconds — may need to query quickly during the job.)
4. Check `deployments` table:
   ```sql
   SELECT status, deployed_at, duration_ms, error FROM deployments
   WHERE site_id = '<site-id>'
   ORDER BY created_at DESC LIMIT 1;
   ```
5. **Expected:** Row with `status='succeeded'`, `deployed_at` set, `duration_ms` non-null, `error` null.
6. Check `domains` table:
   ```sql
   SELECT cf_zone_id, cf_nameservers, dns_status FROM domains
   WHERE site_id = '<site-id>';
   ```
7. **Expected:** `cf_zone_id` non-null (e.g. `"a1b2c3d4..."`), `cf_nameservers` is an array of two NS strings (e.g. `["anna.ns.cloudflare.com", "bob.ns.cloudflare.com"]`), `dns_status` is `'pending'` (becomes `'active'` only after SSL confirms).

### 6. Deployment card renders all state

1. After a completed deploy job, hard-reload the site detail page
2. Scroll to the "Deployment" card
3. **Expected:** Card shows:
   - Pipeline status badge matching `sites.status` (e.g. `dns_pending`)
   - Latest deployment row: status (succeeded), deployed_at timestamp, duration_ms value
   - CF Nameservers section: "Point your domain to these nameservers:" followed by the two NS strings from `domains.cf_nameservers`
4. **Expected:** No "No deployment data" empty state — data is present.

### 7. SslPollerJob — state transitions after NS propagation

Requires: NS records at domain registrar updated to Cloudflare nameservers (from Test 5), DNS propagated (can take minutes to hours).

1. Wait until Cloudflare reports SSL as active (check in CF dashboard: SSL/TLS → Edge Certificates)
2. `SslPollerJob` runs every 60s — after next poll cycle, check `sites.status`:
   ```sql
   SELECT status FROM sites WHERE id = '<site-id>';
   ```
3. **Expected:** `status` transitions from `dns_pending` → (next poll) → `live`.
4. Check `domains.dns_status`:
   ```sql
   SELECT dns_status FROM domains WHERE site_id = '<site-id>';
   ```
5. **Expected:** `dns_status = 'active'`.
6. **Expected Deployment card:** Status badge shows `live`.

### 8. curl verification — CF-RAY header present

Requires: Test 7 complete (site.status = 'live').

1. From any machine:
   ```bash
   curl -I https://<site-domain>
   ```
2. **Expected:**
   - HTTP status 200 (or 301/302 if www redirect)
   - `CF-RAY: <hash>-<datacenter>` header present
   - `server: cloudflare` header present
   - SSL valid (no certificate warnings)

### 9. Redeploy — idempotent zone and A record

1. Click "Deploy" again on the same site (after Test 5 completed)
2. **Expected:** No duplicate Cloudflare zones created. `ensureZone()` finds the existing zone and returns it. `ensureARecord()` finds the A record, sees content matches, skips delete+recreate.
3. Worker logs should show:
   - `[CloudflareClient] ensureZone: found existing zone id=...`
   - `[CloudflareClient] ensureARecord: A record already correct, skipping update`
4. Check Cloudflare dashboard: still one zone for the domain, still one A record.

### 10. CloudflareClient export — node import check

```bash
node -e "
import('/home/daniel/monster/packages/domains/dist/index.js').then(m => {
  console.log('CloudflareClient type:', typeof m.CloudflareClient);
  const cf = new m.CloudflareClient();
  console.log('methods:', Object.getOwnPropertyNames(m.CloudflareClient.prototype));
});
"
```
**Expected:**
```
CloudflareClient type: function
methods: [ 'constructor', 'fetchApiToken', 'ensureZone', 'ensureARecord', 'pollSslStatus' ]
```

## Edge Cases

### Deploy button with no generated dist

1. Create a site with a domain set, but no prior generation (no `.generated-sites/<slug>/dist/` directory)
2. Click "Deploy"
3. **Expected:** Job is enqueued, worker picks it up, rsync fails with a clear error. `deployments.status='failed'`, `deployments.error` contains rsync stderr (mentions the missing source path). `sites.status='error'`. `DeployStatus` component shows `failed` state. Error is inspectable via `ai_jobs` table.

### Invalid Cloudflare token

1. Set `cloudflare_api_token` to an invalid or expired token in Settings
2. Click "Deploy" on a site with a valid domain
3. **Expected:** Deploy job fails at the CF zone step. `deployments.status='failed'`, error mentions CF authentication failure. `sites.status='error'`. No partial zone created in Cloudflare.

### SslPollerJob exhausts 30 retries

1. Set up a domain where Cloudflare cannot issue an SSL cert (e.g. wrong A record, or NS not propagated within 30 minutes)
2. Wait for SslPollerJob to run ~30 times
3. **Expected:** After attempt 30, `sites.status='error'`. `SslPollerJob` stops re-enqueueing. No further polling occurs. Error is visible in `ai_jobs` table (last `ssl_poller` job with `status='failed'` or `status='completed'` with error context).

### Site without domain — enqueueSiteDeploy server action guard

1. Call `enqueueSiteDeploy(siteId)` directly where site has `domain=null`
2. **Expected:** Server action returns early or throws before enqueuing. No `ai_jobs` row created. If called via Deploy button, button is disabled and form submission is blocked at UI level.

## Failure Signals

- Deploy button enabled but clicking produces no effect → check `ai_jobs` table for new row; if absent, server action or form wiring is broken
- `DeployStatus` component stuck on "No deploy jobs yet" after clicking Deploy → `getLatestDeployStatus()` query filtering issue or `ai_jobs` row not created
- `deployments` row shows `status='failed'` → inspect `error` column; cross-reference with `[DeployPhase]` logs in worker output
- `domains.cf_nameservers` is null or empty array → migration not applied to remote DB; apply `20260314000002_cf_nameservers.sql` via Supabase dashboard
- `domains` row absent after deploy → upsert conflict target mismatch; check that UNIQUE constraint exists on `domains.domain`
- `sites.status` stuck at `deploying` → deploy phase threw before reaching CF step; check `deployments.error` + worker logs
- `sites.status` stuck at `dns_pending` → SslPollerJob not picking up jobs (worker not running on `'ssl-poller'` queue) or CF SSL not yet active
- `curl -I` shows no `CF-RAY` → NS records not yet pointing to Cloudflare; check registrar NS settings

## Requirements Proved By This UAT

- R006 (Automated deployment to VPS2 via Cloudflare) — Test 5 + 8 prove the full pipeline: rsync to VPS2, CF zone + A record creation, state machine persisted in Supabase, `CF-RAY` header in curl response. Validates that manual deployment is no longer required for basic site delivery.

## Not Proven By This UAT

- Full R006 proof (`curl -I` CF-RAY) requires NS propagation — a human wait of minutes to hours that cannot be automated. Tests 7 and 8 are human-executed after propagation.
- R011 (Domain management via Spaceship) — not implemented in S02. S03 covers Spaceship availability check + registration + NS update.
- R001 (End-to-end pipeline < 30 min) — pipeline is complete but total time has not been benchmarked end-to-end. Cloudflare zone creation + NS propagation adds human wait time not counted in the 30-min target.
- SslPollerJob exhaustion behavior (edge case) is hard to trigger in normal UAT — requires intentionally broken NS configuration and waiting 30 minutes.

## Notes for Tester

- **Apply the migration first**: `20260314000002_cf_nameservers.sql` must be applied to Supabase before any deploy job will succeed. Without it, the `domains` upsert step will fail with a column-not-found error.
- **Cloudflare token permissions**: The token needs Zone:Edit (to create zones + DNS records) and Zone:Read (to list zones). A token with Zone:Read only will fail silently at `zones.create()` step. Check CF dashboard API tokens if zone creation fails.
- **NS propagation is slow**: After deploying, the site will be in `dns_pending` until NS records at the registrar are updated to Cloudflare's nameservers and propagated. This is a human step — copy the nameservers from the Deployment card and update them at your registrar.
- **Deployment card is SSR**: It shows a snapshot at page load time. Use `DeployStatus` component for live polling of job status. Hard-reload the page to see updated `sites.status` after polling transitions.
- **Worker must be running**: BullMQ jobs won't execute if the worker process is not running. Verify with `pm2 list` or check for `[worker] ... listening on queue` log lines.
- **Test idempotency (Test 9) requires a completed first deploy**: The A record idempotency check only works if the A record already exists from a prior deploy. Run Test 5 to completion before running Test 9.
