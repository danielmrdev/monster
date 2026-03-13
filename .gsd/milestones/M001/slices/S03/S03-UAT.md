# S03: Shared Packages — UAT

**Milestone:** M001
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S03 produces compiled packages and TypeScript declarations with no runtime server or UI. All contracts (type exports, build artifacts, cross-workspace resolution, error surfaces) are fully verifiable via CLI commands against the local filesystem and Node.js runtime. No live server required.

## Preconditions

- Working directory: `/home/daniel/monster` (monorepo root)
- `pnpm install` has been run at monorepo root (workspace symlinks in place)
- `.env` file present with valid Supabase env vars (needed only for the service client runtime check — the packages themselves don't need it at build time)
- S02 complete: `packages/db/src/types/supabase.ts` exists and starts with `export type Json`

## Smoke Test

```bash
cd /home/daniel/monster
pnpm --filter @monster/db build && pnpm --filter @monster/shared build
```

Expected: both commands exit 0 and print `⚡️ Build success` for ESM and DTS phases. If either exits non-zero, S03 is broken.

## Test Cases

### 1. packages/db dist artifacts present and non-empty

```bash
ls -la packages/db/dist/index.js packages/db/dist/index.d.ts
```

1. Run the command above.
2. **Expected:** Both files listed with non-zero byte counts. `index.js` ~1.2 KB (ESM factory functions). `index.d.ts` ~106 KB (re-exports of full supabase.ts type tree).

---

### 2. packages/shared dist artifacts present and non-empty

```bash
ls -la packages/shared/dist/index.js packages/shared/dist/index.d.ts
```

1. Run the command above.
2. **Expected:** Both files listed with non-zero byte counts. `index.js` ~1.5 KB. `index.d.ts` ~4.7 KB.

---

### 3. packages/db has no Next.js imports

```bash
grep -r "next/headers\|next/server\|next/navigation" packages/db/src/
```

1. Run the command above.
2. **Expected:** No output (grep exits 1). Any match means the Next.js boundary has been violated — packages/db must remain framework-agnostic.

---

### 4. packages/shared has zero runtime dependencies

```bash
node -e "
const p = JSON.parse(require('fs').readFileSync('packages/shared/package.json', 'utf8'));
const d = Object.keys(p.dependencies || {});
console.assert(d.length === 0, 'FAIL: runtime deps found: ' + d);
console.log('OK: zero runtime deps');
"
```

1. Run the command above.
2. **Expected:** `OK: zero runtime deps`. Any other output means a runtime dep was accidentally added.

---

### 5. packages/db exports correct type helpers

```bash
node --input-type=module -e "
import pkg from './packages/db/dist/index.js';
const exports = Object.keys(pkg);
const required = ['createBrowserClient', 'createServiceClient'];
for (const r of required) {
  if (!exports.includes(r)) console.log('FAIL: missing export', r);
  else console.log('OK:', r);
}
"
```

1. Run the command above.
2. **Expected:** `OK: createBrowserClient` and `OK: createServiceClient` on separate lines.

> Note: `Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate` are TypeScript type exports — they are not present in the JS runtime bundle. Verify them via TypeScript type-check (test case 8).

---

### 6. createServiceClient throws descriptively on missing env var

```bash
node --input-type=module -e "
import { createServiceClient } from './packages/db/dist/index.js';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
try {
  createServiceClient();
  console.log('FAIL: should have thrown');
} catch(e) {
  if (e.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    console.log('OK: descriptive error —', e.message);
  } else {
    console.log('FAIL: unexpected error:', e.message);
  }
}
"
```

1. Run the command above.
2. **Expected:** `OK: descriptive error — Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY — this client must only be used in server-side contexts where this key is available.`
3. The error message must mention `SUPABASE_SERVICE_ROLE_KEY` by name. It must NOT contain the actual value of any secret.

---

### 7. SITE_STATUS_FLOW covers all 8 SiteStatus values

```bash
node --input-type=module -e "
import { SITE_STATUS_FLOW } from './packages/shared/dist/index.js';
const keys = Object.keys(SITE_STATUS_FLOW);
const expected = ['draft', 'generating', 'deploying', 'dns_pending', 'ssl_pending', 'live', 'paused', 'error'];
for (const k of expected) {
  if (!keys.includes(k)) console.log('FAIL: missing status', k);
  else console.log('OK:', k);
}
console.log('All keys present:', keys.length === expected.length ? 'yes' : 'FAIL - got ' + keys.length);
"
```

1. Run the command above.
2. **Expected:** `OK:` line for each of the 8 statuses, then `All keys present: yes`.

---

### 8. Cross-workspace TypeScript resolution from apps/admin

```bash
pnpm --filter @monster/admin exec tsc --noEmit
echo "Exit code: $?"
```

1. Run the command above.
2. **Expected:** No tsc output (zero errors, zero warnings). Exit code `0`.
3. If TS2307 appears (`Cannot find module '@monster/db'`): workspace symlinks are broken — run `pnpm install` at monorepo root.
4. If TS2305 appears (`Module ... has no exported member`): a type export is missing from the package's index.ts.

---

### 9. packages/db type-check clean in isolation

```bash
pnpm --filter @monster/db typecheck
echo "Exit code: $?"
```

1. Run the command above.
2. **Expected:** No output, exit code `0`.

---

### 10. packages/shared type-check clean in isolation

```bash
pnpm --filter @monster/shared typecheck
echo "Exit code: $?"
```

1. Run the command above.
2. **Expected:** No output, exit code `0`.

---

### 11. AMAZON_MARKETS contains expected ES market entry

```bash
node --input-type=module -e "
import { AMAZON_MARKETS } from './packages/shared/dist/index.js';
const es = AMAZON_MARKETS.find(m => m.slug === 'ES');
if (!es) { console.log('FAIL: ES market not found'); process.exit(1); }
console.log('OK: ES market —', JSON.stringify(es));
"
```

1. Run the command above.
2. **Expected:** `OK: ES market — {"slug":"ES","domain":"amazon.es","name":"Amazon España","currency":"EUR","flag":"🇪🇸"}` (or equivalent). The `slug` must be `'ES'` and `domain` must be `'amazon.es'`.

---

### 12. Workspace symlinks are present

```bash
ls apps/admin/node_modules/@monster/db/dist/index.js
ls apps/admin/node_modules/@monster/shared/dist/index.js
```

1. Run both commands above.
2. **Expected:** Both files listed. These are not copies — they are resolved through pnpm's workspace symlinks to the actual package dist.

---

## Edge Cases

### supabase.ts corruption guard

```bash
head -1 packages/db/src/types/supabase.ts
```

1. Run the command above.
2. **Expected:** `export type Json =` — the file must start with a TypeScript export. If the first line is blank, contains a Docker image tag (e.g., `supabase/postgres`), or contains `Pulling from`, the file is corrupted and must be regenerated and stripped of prefixed noise.

---

### createBrowserClient with missing URL env var

```bash
node --input-type=module -e "
import { createBrowserClient } from './packages/db/dist/index.js';
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
try {
  createBrowserClient();
  console.log('FAIL: should have thrown');
} catch(e) {
  console.log('OK: threw on missing URL —', e.message.substring(0, 80));
}
"
```

1. Run the command above.
2. **Expected:** An error mentioning the missing env var. The factory must not silently produce an invalid client.

---

### packages/shared build is idempotent

```bash
pnpm --filter @monster/shared build && pnpm --filter @monster/shared build
echo "Exit: $?"
```

1. Run the command above (builds twice in sequence).
2. **Expected:** Both builds succeed. The second build cleans and rebuilds — no stale artifact interference. Exit code `0`.

---

## Failure Signals

- `Cannot find module '@monster/db' or its corresponding type declarations` — workspace symlink broken; run `pnpm install`
- `dist/index.js: No such file or directory` — package not built; run `pnpm --filter @monster/db build`
- `Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY` — expected in test case 6; failure if it does NOT appear
- `Property 'X' is missing in type 'Record<SiteStatus, SiteStatus[]>'` — SITE_STATUS_FLOW missing a SiteStatus key; update constants/index.ts
- `Type 'Y' is not assignable to type 'AmazonMarket'` — an entry in AMAZON_MARKETS uses an unrecognized market slug; update types and constants to match
- `error TS18003: No inputs were found` — apps/admin/src/index.ts is missing (placeholder deleted without replacement); S04 should have replaced it

## Requirements Proved By This UAT

- R002 (extensible site type architecture) — `packages/shared` exports `SiteType`, `SiteStatus`, `Site`, `TsaCategory`, `TsaProduct` typed against the extensible schema. Adding a new site type requires only adding a new entry to the `SiteType` union — no structural changes.

## Not Proven By This UAT

- Auth, session handling, protected routes — S04 scope
- Server component usage of createServiceClient in a real Next.js request — S04 scope
- BullMQ job consuming @monster/db types — M003 scope
- Cloudflare/Spaceship/DataForSEO clients — later milestone scope
- pm2 process management and deploy workflow — S05 scope

## Notes for Tester

- All test cases run in `artifact-driven` mode against the local filesystem. No network calls needed.
- Test cases 5 and 6 use `node --input-type=module` to exercise the actual ESM dist artifact (not the TypeScript source). This is intentional — it validates the compiled output, not the compilation.
- Test case 8 (admin tsc) is the integration test that matters most for S04 readiness. If this fails, S04 cannot start.
- The `packages/db/dist/index.d.ts` file is ~106 KB because it re-exports the full Supabase schema types. This is expected and correct — it's what gives downstream consumers full type inference for every table and column.
