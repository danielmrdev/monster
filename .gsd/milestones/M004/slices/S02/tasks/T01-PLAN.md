---
estimated_steps: 7
estimated_files: 6
---

# T01: Set up `packages/domains` + `CloudflareClient`

**Slice:** S02 — Cloudflare Automation + Deploy Pipeline
**Milestone:** M004

## Description

`packages/domains` is currently a bare stub — no src directory, no build config, no exports. This task bootstraps it into a fully functional package and implements `CloudflareClient`, the Cloudflare API wrapper that S02's deploy phase depends on.

The three methods on `CloudflareClient` cover the full async lifecycle of bringing a site to the edge: `ensureZone()` creates or retrieves the CF zone (idempotent — D066), `ensureARecord()` upserts the A record pointing to VPS2, and `pollSslStatus()` checks Universal SSL certificate readiness. All credential reads follow the D028 pattern — no `process.env`, reads from Supabase `settings` table at call time.

The DB migration adds `cf_nameservers text[]` to the `domains` table (needed to display assigned NS records to the user in S02/T03 and for the Spaceship NS update in S03). Supabase types are regenerated so downstream TypeScript compiles correctly.

## Steps

1. **Install packages:** `pnpm --filter @monster/domains add cloudflare @monster/db` and `pnpm --filter @monster/domains add -D tsup typescript @types/node`. (Note: `@monster/db` is a workspace package — pnpm resolves it automatically.)

2. **Update `packages/domains/package.json`:** Set `type: "module"`, add `exports` map (`"."` → `./dist/index.js` + types), add scripts (`build: tsup`, `typecheck: tsc --noEmit`, `dev: tsup --watch`). The `@monster/db` dependency and devDeps should be in the file after the install in step 1 — verify they landed correctly.

3. **Create `packages/domains/tsup.config.ts`:** Mirror `packages/deployment/tsup.config.ts` — ESM, `dts: true`, `target: 'node20'`, `external: ['cloudflare']`, `clean: true`. Single entry: `src/index.ts`.

4. **Implement `packages/domains/src/cloudflare.ts`:**
   - Import `Cloudflare` from `'cloudflare'`; import `createServiceClient` from `'@monster/db'`
   - `CloudflareClient` class with three public methods; instantiate `new Cloudflare({ apiToken })` inside each method body after reading the token from Supabase (D028 pattern — read `cloudflare_api_token` setting, cast `.value as { value: string }).value`)
   - `ensureZone(domain: string): Promise<{ zoneId: string; nameservers: string[] }>` — call `client.zones.list({ name: domain })`; if `result[0]` exists return `{ zoneId: result[0].id, nameservers: result[0].name_servers }`. Otherwise call `client.zones.create({ account: {}, name: domain, type: 'full' })` and return its `id` + `name_servers`.
   - `ensureARecord(zoneId: string, vps2Ip: string, domain: string): Promise<void>` — `client.dns.records.list({ zone_id: zoneId, type: 'A', name: domain })`; check `page.result` for an existing record; if found and `content === vps2Ip`, skip; if found with different content, delete it with `client.dns.records.delete(existing.id, { zone_id: zoneId })`; create with `client.dns.records.create({ zone_id: zoneId, type: 'A', name: domain, content: vps2Ip, ttl: 1, proxied: true })`.
   - `pollSslStatus(zoneId: string): Promise<'active' | 'pending'>` — `client.ssl.verification.get({ zone_id: zoneId })`; if result array is empty or none has `certificate_status === 'active'`, return `'pending'`; otherwise return `'active'`.
   - All console.log/error lines prefixed `[CloudflareClient]`.

5. **Create `packages/domains/src/index.ts`:** Export `{ CloudflareClient }`.

6. **Write DB migration `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql`:**
   ```sql
   -- M004/S02: add cf_nameservers array to domains table for Cloudflare NS display
   ALTER TABLE domains ADD COLUMN IF NOT EXISTS cf_nameservers text[] DEFAULT '{}';
   ```

7. **Regenerate Supabase types:** Run `pnpm --filter @monster/db generate-types` (or `supabase gen types typescript --local > packages/db/src/types/supabase.ts` if the script name differs). Verify `cf_nameservers` appears in the `domains` Row/Insert/Update shapes in `supabase.ts`.

## Must-Haves

- [ ] `pnpm --filter @monster/domains build` exits 0 with `dist/index.js` and `dist/index.d.ts` present
- [ ] `pnpm --filter @monster/domains typecheck` exits 0
- [ ] `CloudflareClient` exported from `dist/index.js` (runtime check: `typeof m.CloudflareClient === 'function'`)
- [ ] `ensureZone`, `ensureARecord`, `pollSslStatus` all present as methods on `CloudflareClient.prototype`
- [ ] `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` exists with `ALTER TABLE domains ADD COLUMN IF NOT EXISTS cf_nameservers text[]`
- [ ] `cf_nameservers` column present in `packages/db/src/types/supabase.ts` `domains.Row`, `domains.Insert`, `domains.Update`
- [ ] `cloudflare` package is listed as `external` in `tsup.config.ts` (not bundled)
- [ ] Credentials never logged; only `[CloudflareClient]` prefixed operational messages

## Verification

```bash
# Build + typecheck
pnpm --filter @monster/domains build
pnpm --filter @monster/domains typecheck

# Export check
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => {
  const proto = Object.getOwnPropertyNames(m.CloudflareClient.prototype)
  console.log(proto)  // expect: ['constructor','ensureZone','ensureARecord','pollSslStatus']
})"

# Migration file present
cat packages/db/supabase/migrations/20260314000002_cf_nameservers.sql

# Types regenerated
grep "cf_nameservers" packages/db/src/types/supabase.ts
# Expected: at least 3 matches (Row, Insert, Update)

# cloudflare is NOT bundled (external)
grep -c "cloudflare" packages/domains/dist/index.js
# Expected: very low number (just the import statement) — not the full SDK inlined
```

## Observability Impact

- Signals added: `[CloudflareClient]` prefixed console.log lines for zone lookup, zone create, A record operations, SSL polling results
- Failure state exposed: throws with descriptive messages including zone ID, domain, and step name on any CF API error
- How a future agent inspects this: `node -e "import('.../dist/index.js').then(m => console.log(typeof m.CloudflareClient))"` confirms build; `grep cf_nameservers packages/db/src/types/supabase.ts` confirms migration applied

## Inputs

- `packages/deployment/tsup.config.ts` — mirror this for the domains tsup config pattern
- `packages/deployment/package.json` — mirror for package.json structure
- `packages/agents/src/clients/dataforseo.ts` — D028/D050 credential read pattern to replicate
- `packages/domains/tsconfig.json` — already extends `../../tsconfig.base.json` with NodeNext; no changes needed
- Research constraint: `zones.create()` needs `account: {}` (empty — id is optional); `dns.records.list()` returns `page.result` array; `ssl.verification.get()` may return empty array (treat as pending)

## Expected Output

- `packages/domains/src/cloudflare.ts` — `CloudflareClient` class (new)
- `packages/domains/src/index.ts` — barrel export (new)
- `packages/domains/tsup.config.ts` — tsup build config (new)
- `packages/domains/package.json` — updated with type, exports, scripts, dependencies
- `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` — migration (new)
- `packages/db/src/types/supabase.ts` — regenerated with `cf_nameservers` column
