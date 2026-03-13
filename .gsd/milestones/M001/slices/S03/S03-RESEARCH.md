# S03: Shared Packages — Research

**Date:** 2026-03-13

## Summary

S03 builds two packages from scratch on top of S02's generated types: `packages/db` (typed Supabase client exports) and `packages/shared` (domain types + constants). Both must compile cleanly and be importable from `apps/admin` in S04.

The scope is deliberately narrow: no logic, no queries, no React — just typed factories and domain definitions. The highest-risk call here is the build toolchain choice and the module format (CJS vs ESM). The right choice is **tsup for building** and **ESM-only output** — reasoning below.

There's one architectural split that wasn't obvious from the boundary map: `packages/db/src/client.ts` should NOT contain Next.js cookie-aware server component helpers. Those go in `apps/admin/src/lib/supabase/` (S04). `packages/db` provides only the browser client factory and the service-role client — neither requires `next/headers`.

## Recommendation

Use **tsup** (not plain `tsc`) as the build tool for both packages. Output ESM-only. Add `"type": "module"` to both package.json files. Wire `package.json` exports maps properly. Then `pnpm build` at root runs tsup in both packages and produces `dist/index.js` + `dist/index.d.ts`.

Avoid plain `tsc` with `NodeNext` module: it requires explicit `.js` extensions in every import (`./foo.js` not `./foo`), which is painful to write and fragile to maintain. tsup handles all of this automatically and is a one-dep solution with zero config for basic library builds.

The `packages/db/tsconfig.json` currently has `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` — this is correct for type-checking but let tsup own the actual emit, not tsc.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Library build with ESM output + .d.ts | `tsup` | Handles extension resolution, dts generation, tree-shaking in one dep |
| Typed Supabase client | `@supabase/ssr` createBrowserClient + `@supabase/supabase-js` createClient | Already in the S02 plan; generates proper typed client from `Database` generic |
| Server-side typed queries (S04) | `createServerClient` from `@supabase/ssr` — but in `apps/admin`, NOT in `packages/db` | Keeps `packages/db` free of Next.js dependency |

## Existing Code and Patterns

- `packages/db/src/types/supabase.ts` — 1218-line generated TypeScript types, do NOT edit by hand. All `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>` helpers already exported. This is the foundation for typed client factories.
- `packages/db/package.json` — currently has `"exports": {}` (empty) and no `scripts`. Both need to be filled.
- `packages/shared/` — directory exists with `package.json` and `tsconfig.json`, but no `src/` directory yet.
- `packages/db/tsconfig.json` — overrides base with `module: NodeNext, moduleResolution: NodeNext`. This is correct for type-checking; tsup will handle emit separately.
- `tsconfig.base.json` — has `"moduleResolution": "Bundler"` at root level. The package-level override wins cleanly.
- `/home/daniel/nous/ecosystem.config.js` — pm2 pattern reference (relevant to S05, not S03).

## Constraints

- Node 22.22.1 on VPS1 — full ESM support, `type: module` is safe.
- `packages/db` must NOT import from `next/headers` or any Next.js module — it would pollute S04's dependency graph.
- `packages/shared` must have zero runtime dependencies — pure types + constants only. Avoids any version conflict surface.
- `@supabase/supabase-js` v2.99.1 and `@supabase/ssr` v0.9.0 are current. Both support TypeScript generics for the `Database` type.
- The `exports` field in `package.json` is required for NodeNext module resolution. An empty `{}` will cause import failures from `apps/admin`.
- `updated_at` is NOT auto-maintained by DB triggers (D016). The client layer must set it explicitly on every update. Establish a pattern in `packages/db` helper utilities (or at minimum document it clearly) so S04 doesn't silently break this.
- `SUPABASE_SERVICE_ROLE_KEY` is needed for `createServiceClient()`. This env var is already in `.env` (collected in S02/T03) but not yet used by any code.

## Common Pitfalls

- **Empty `exports` map** — `packages/db/package.json` currently has `"exports": {}`. NodeNext module resolution will fail to find any exports from `@monster/db`. Must set `"exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`.
- **`packages/db` importing from Next.js** — The boundary map says `client.ts` uses `@supabase/ssr`, which is fine (ssr package has no Next.js dependency). But `createServerClient` with cookie handlers requires `next/headers` — that MUST stay in `apps/admin`. Don't leak it into `packages/db`.
- **`updated_at` silently staling** — The S02 forward intelligence called this out as the most likely thing to go wrong. Any `update()` call without explicitly setting `updated_at: new Date().toISOString()` leaves the timestamp stale. Add a helper or at minimum a comment on every update factory.
- **tsconfig `module` mismatch** — The base has no `module` field (defaults to CommonJS in older TS, ES6 in newer). The package-level tsconfig overrides to `NodeNext`. If someone adds tsc scripts that bypass the package tsconfig, they'll get confusing output. Always run tsc from the package directory, not root.
- **`createServiceClient` env var at import time** — If the factory reads `process.env.SUPABASE_SERVICE_ROLE_KEY` at module load (not at call time), it'll return empty string in test/build contexts. Read env vars inside the factory function body, not at module scope.
- **pnpm workspace protocol** — `apps/admin`'s `package.json` will reference `@monster/db` and `@monster/shared` as `workspace:*`. This is the correct pnpm syntax and requires `pnpm install` to link them. Don't use file: protocol.

## Open Risks

- **tsup + NodeNext tsconfig interaction**: tsup reads tsconfig but ignores `module` (it uses its own esbuild pipeline). If tsc type-check scripts are added later using the package tsconfig, they'll work independently. But mixing `tsc --emit` + tsup in the same package creates confusion. Recommendation: use tsup for emit, `tsc --noEmit` for type-check only.
- **apps/admin transpilePackages**: S04's `next.config.ts` is described as "transpiles `@monster/*` packages". With pre-compiled packages, `transpilePackages` is NOT needed and should NOT be set (it would cause Next.js to try to process the TS source, which won't be there). If S04 uses `transpilePackages`, it needs to point to the source — but that conflicts with the pre-compile approach. **Recommendation for S04**: do NOT use `transpilePackages` when packages pre-compile to `dist/`. Use workspace protocol imports pointing to `dist/`.
- **`@supabase/ssr` as dependency of `packages/db`**: createBrowserClient is exported from `@supabase/ssr`. This is appropriate as a runtime dep of `packages/db`. However, in S04 when `apps/admin` creates server component clients, it will also install `@supabase/ssr` directly. That duplication is fine — pnpm deduplicates by version.

## Package Architecture (what S03 builds)

### `packages/db`

```
packages/db/
  src/
    types/
      supabase.ts          ← generated, do not edit
    client.ts              ← createBrowserClient<Database>() + createServiceClient()
    index.ts               ← re-exports: Database, createBrowserClient, createServiceClient, Tables helpers
  dist/                    ← tsup output (ESM + .d.ts)
  tsup.config.ts           ← entry: src/index.ts, format: esm, dts: true
  package.json             ← type:module, exports map, deps: @supabase/ssr, @supabase/supabase-js
  tsconfig.json            ← existing (module:NodeNext, used for tsc --noEmit only)
```

**`client.ts` exports:**
- `createBrowserClient()` → typed `SupabaseClient<Database>` via `@supabase/ssr`
- `createServiceClient()` → typed `SupabaseClient<Database>` via `@supabase/supabase-js` with service role key (reads env at call time)

**`index.ts` re-exports:**
- `Database` type from `./types/supabase.js`
- `Json` type from `./types/supabase.js`  
- `Tables`, `TablesInsert`, `TablesUpdate` helpers from `./types/supabase.js`
- `createBrowserClient`, `createServiceClient` from `./client.js`

### `packages/shared`

```
packages/shared/
  src/
    types/
      index.ts             ← Site, SiteType, SiteStatus, SiteTemplate, TsaCategory, TsaProduct, AmazonMarket, Language, etc.
    constants/
      index.ts             ← AMAZON_MARKETS, SUPPORTED_LANGUAGES, SITE_STATUS_FLOW, REBUILD_TRIGGERS
    index.ts               ← re-exports from types + constants
  dist/                    ← tsup output
  tsup.config.ts
  package.json             ← type:module, exports map, zero deps
```

**Domain types (narrowed from DB strings to TypeScript string literals):**
- `SiteStatus` = `'draft' | 'generating' | 'deploying' | 'dns_pending' | 'ssl_pending' | 'live' | 'paused' | 'error'`
- `AmazonMarket` = `'ES' | 'US' | 'UK' | 'DE' | 'FR' | 'IT' | 'MX' | 'CA' | 'JP' | 'AU'`
- `Language` = `'es' | 'en' | 'de' | 'fr' | 'it' | 'ja'`
- `SiteTemplate` = `'classic' | 'modern' | 'minimal'`
- `Site` — domain interface matching `Tables<'sites'>['Row']` shape but with narrowed string-literal fields
- `TsaCategory`, `TsaProduct` — similarly narrowed interfaces

**Constants (as `as const` objects for type inference):**
- `AMAZON_MARKETS` — array of `{ slug: AmazonMarket; label: string; domain: string; currency: string }[]`
- `SUPPORTED_LANGUAGES` — array of `{ code: Language; label: string }[]`
- `SITE_STATUS_FLOW` — `Record<SiteStatus, SiteStatus[]>` — valid next states per status
- `REBUILD_TRIGGERS` — `['price' | 'availability' | 'images']` — per D008

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript library packages | none needed | tsc + tsup are standard tooling |
| @supabase/ssr | Context7 docs fetched | `/supabase/ssr` — good coverage, no skill needed |

## Sources

- `@supabase/ssr` v0.9.0 API: `createBrowserClient<Database>()` and `createServerClient<Database>()` both accept Database generic; cookie handlers required for server client (source: Context7 /supabase/ssr)
- tsup v8.5.1 available on npm; handles ESM emit + .d.ts generation without explicit .js import extensions (source: npm)
- `@supabase/supabase-js` v2.99.1 exports dual CJS+ESM via package.json `exports` map (source: `npm view @supabase/supabase-js exports`)
- Node 22.22.1 installed on VPS1 — full native ESM support confirmed (source: VPS1 environment)
- `packages/db/package.json` `exports` field currently `{}` — causes NodeNext resolution failures (source: codebase inspection)
- S02 forward intelligence: `updated_at` is NOT auto-maintained; client must set explicitly on every update (source: S02-SUMMARY.md)
