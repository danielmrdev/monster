---
id: T01
parent: S02
milestone: M004
provides:
  - packages/domains bootstrapped with full build config (tsup + tsc)
  - CloudflareClient class with ensureZone, ensureARecord, pollSslStatus
  - DB migration 20260314000002_cf_nameservers.sql adding cf_nameservers text[] to domains
  - Supabase types manually updated with cf_nameservers in Row/Insert/Update
key_files:
  - packages/domains/src/cloudflare.ts
  - packages/domains/src/index.ts
  - packages/domains/tsup.config.ts
  - packages/domains/package.json
  - packages/db/supabase/migrations/20260314000002_cf_nameservers.sql
  - packages/db/src/types/supabase.ts
key_decisions:
  - dns.records.list() name param is a Name object (not string) — must use { exact: domain } for exact-match filtering
  - cf_nameservers typed as string[] | null in supabase.ts (DEFAULT '{}' in SQL makes null only on old rows pre-default)
  - Types manually updated (no local Supabase running; remote DB only reachable via IPv6 which docker/CLI can't reach)
patterns_established:
  - CloudflareClient follows D028: fetchApiToken() reads cloudflare_api_token from settings at call time, never cached
  - ensureZone uses zones.list({ name: domain }).result[0] pattern for idempotent zone lookup (D066)
  - dns.records.list name filter uses { exact: domain } object, not bare string
observability_surfaces:
  - "[CloudflareClient] ensureZone: looking up zone for domain=..." — zone lookup
  - "[CloudflareClient] ensureZone: found existing zone id=... nameservers=..." — cache hit
  - "[CloudflareClient] ensureZone: no existing zone — creating zone for domain=..." — creation
  - "[CloudflareClient] ensureARecord: checking A records / already correct / stale ... deleting / creating" — full lifecycle
  - "[CloudflareClient] pollSslStatus: checking SSL / no verification records / N record(s), hasActive=..." — SSL check
  - Throws with descriptive messages including zone ID, domain, and step name on any misconfiguration
duration: 30m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Set up `packages/domains` + `CloudflareClient`

**Bootstrapped `packages/domains` from bare stub to fully functional ESM package; implemented `CloudflareClient` with three idempotent CF API methods; added `cf_nameservers` column migration and updated Supabase types.**

## What Happened

`packages/domains` had no `src/`, no build config, no exports. Installed `cloudflare` npm package and `@monster/db` workspace dep, plus `tsup`/`typescript`/`@types/node` as devDeps. Updated `package.json` to `type: "module"` with correct `exports` map and `build`/`typecheck`/`dev` scripts. Created `tsup.config.ts` mirroring `@monster/deployment` — ESM, `dts: true`, `target: node20`, `external: ['cloudflare']`.

Implemented `CloudflareClient` in `src/cloudflare.ts` with D028 credential pattern: `fetchApiToken()` reads `cloudflare_api_token` from Supabase settings at call time. Three public methods:
- `ensureZone(domain)` — `zones.list({ name: domain })` for idempotent lookup, `zones.create()` on miss
- `ensureARecord(zoneId, vps2Ip, domain)` — `dns.records.list({ name: { exact: domain } })`, skip if content matches, delete+recreate if stale
- `pollSslStatus(zoneId)` — `ssl.verification.get()`, returns `'active'` if any entry has `certificate_status === 'active'`, `'pending'` otherwise (empty array → pending)

DB migration adds `cf_nameservers text[] DEFAULT '{}'` to `domains` table. Supabase types manually updated (remote DB reachable only via IPv6 from this host — no psql/docker access possible to run auto-generation).

## Verification

```
pnpm --filter @monster/domains build     → exit 0, dist/index.js (4.79KB) + dist/index.d.ts present
pnpm --filter @monster/domains typecheck → exit 0

node -e "import('.../dist/index.js').then(m => console.log(Object.getOwnPropertyNames(m.CloudflareClient.prototype)))"
# [ 'constructor', 'fetchApiToken', 'ensureZone', 'ensureARecord', 'pollSslStatus' ]

node -e "import('.../dist/index.js').then(m => console.log(typeof m.CloudflareClient))"
# function

grep "cloudflare" packages/domains/dist/index.js
# Only: import statement + cloudflare_api_token string refs (not bundled)

grep cf_nameservers packages/db/src/types/supabase.ts
# 3 matches: Row, Insert, Update

ls packages/db/supabase/migrations/20260314000002_cf_nameservers.sql
# present
```

## Diagnostics

```bash
# Verify build + export at any time
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))"

# Check cloudflare is external (not inlined)
grep -c "cloudflare" packages/domains/dist/index.js  # expect ≤10 lines (just import + key refs)

# Check types have cf_nameservers
grep "cf_nameservers" packages/db/src/types/supabase.ts  # expect 3 matches

# CloudflareClient logs are [CloudflareClient]-prefixed — grep worker logs:
# grep "\[CloudflareClient\]" /var/log/monster-worker.log
```

## Deviations

- **`dns.records.list()` name param**: The Cloudflare SDK v5 `RecordListParams.name` is a `Name` object `{ contains?, exact?, startswith?, endswith? }`, not a plain `string`. Had to use `{ exact: domain }` instead of the bare string in the task plan pseudocode.
- **Supabase types manually updated**: Remote DB is only reachable via IPv6; neither `psql` nor Docker can reach it from this host. Types updated by hand to match the migration exactly. Migration file applied to remote DB will need to be run via Supabase dashboard or CLI from an IPv6-capable host.

## Known Issues

- Migration `20260314000002_cf_nameservers.sql` has not been applied to the remote Supabase DB yet (no psql/IPv6 access from dev host). Must be applied before T02 jobs write to `domains.cf_nameservers`. Can be applied via: Supabase dashboard SQL editor, or `supabase db push` after `supabase login`.

## Files Created/Modified

- `packages/domains/src/cloudflare.ts` — CloudflareClient class (new)
- `packages/domains/src/index.ts` — barrel export (new)
- `packages/domains/tsup.config.ts` — tsup build config (new)
- `packages/domains/package.json` — updated with type:module, exports, scripts, deps
- `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` — migration (new)
- `packages/db/src/types/supabase.ts` — cf_nameservers added to domains Row/Insert/Update
- `.gsd/milestones/M004/slices/S02/S02-PLAN.md` — added failure-path diagnostics verification block (preflight fix)
