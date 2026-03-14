---
id: T01
parent: S01
milestone: M005
provides:
  - packages/analytics/dist/tracker.min.js — committed minified IIFE tracker, 1343 bytes
  - packages/analytics/src/tracker.ts — browser tracker source with placeholder strings
  - packages/analytics/package.json — esbuild + typescript devDeps and build/typecheck scripts
key_files:
  - packages/analytics/src/tracker.ts
  - packages/analytics/dist/tracker.min.js
  - packages/analytics/package.json
  - packages/analytics/tsconfig.json
  - packages/analytics/.gitignore
key_decisions:
  - D084: fetch+keepalive as primary transport (not sendBeacon — can't set custom headers)
  - D085: literal placeholder strings in source, string-replaced at Astro build time
patterns_established:
  - Analytics package .gitignore negates root dist/ rule to allow committed tracker artifact
  - tsconfig uses ES2018 target (not ES2017) — required for Promise.finally() DOM types
observability_surfaces:
  - Inspection: grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js | wc -l → must be 3
  - Inspection: stat -c%s packages/analytics/dist/tracker.min.js → must be ≤2048
  - Runtime: browser DevTools Network tab → filter by analytics_events endpoint → verify POST with 200/201 response
  - Runtime: Supabase table editor → analytics_events table → rows with matching site_id
duration: ~30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Build tracker script with esbuild

**Wrote a 1343-byte IIFE tracker with SubtleCrypto visitor hashing, fetch+keepalive POST transport, and all three placeholders preserved in the minified output.**

## What Happened

Added esbuild and typescript as devDependencies to `packages/analytics`. Updated tsconfig to use `ES2018` target (not `ES2017` as written in the plan — ES2018 is required for `Promise.finally()` which the tracker uses for the `flushing` flag reset). Set `lib: ["ES2018", "DOM"]` for Web Crypto API types.

Wrote `src/tracker.ts` with: visitor hash via `crypto.subtle.digest('SHA-256', ...)` with `Math.random` 16-char hex fallback for non-secure contexts; event queue flushed via `fetch` with `keepalive: true` and `apikey`/`Authorization` headers; `pageview` enqueued on init; click listener on `[data-affiliate]` links; flush triggered on `visibilitychange hidden`, `pagehide`, and 5s interval.

Key fix: renamed internal `Event` interface to `AnalyticsEvent` to avoid collision with the DOM's built-in `Event` type.

Built artifact: 1343 bytes. Added `packages/analytics/.gitignore` with `!dist/` and `!dist/tracker.min.js` to override the root `.gitignore`'s `dist/` rule, allowing the committed artifact per D079.

## Verification

```
pnpm --filter @monster/analytics build         → exit 0, dist/tracker.min.js 1.3kb
stat -c%s packages/analytics/dist/tracker.min.js → 1343 (≤2048 ✓)
grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" dist/tracker.min.js | wc -l → 3 ✓
head -c 100 dist/tracker.min.js               → minified IIFE, not human-readable ✓
pnpm --filter @monster/analytics typecheck     → exit 0, no errors ✓
```

Slice-level checks (T01 scope):
- `pnpm --filter @monster/analytics build` exits 0 ✓
- `wc -c packages/analytics/dist/tracker.min.js` ≤ 2048 ✓ (1343 bytes)

## Diagnostics

- Byte bloat investigation: `cd packages/analytics && node_modules/.bin/esbuild src/tracker.ts --bundle --format=iife --platform=browser --target=es2017 | wc -c` (unminified) to identify verbose patterns
- Placeholder missing: if grep count < 3, esbuild tree-shook a variable — wrap the constant in a function or reference it via `window` property to prevent dead-code elimination
- POST failures are silent (try/catch with empty catch); inspect via browser DevTools Network tab filtering for `analytics_events`

## Deviations

- tsconfig target changed from ES2017 (plan) to ES2018 — required for `Promise.finally()`. esbuild still targets es2017 for the output (the `--target=es2017` flag); tsc just needed a higher lib to accept the source. The built output is still compatible with ES2017 engines since esbuild transpiles down.
- `grep -c` placeholder check outputs `1` not `3` (all code is on one minified line). Used `grep -o | wc -l` instead which correctly counts 3 occurrences.

## Known Issues

None.

## Files Created/Modified

- `packages/analytics/src/tracker.ts` — browser tracker source (new)
- `packages/analytics/dist/tracker.min.js` — committed minified IIFE artifact (new, 1343 bytes)
- `packages/analytics/package.json` — added esbuild + typescript devDeps, build + typecheck scripts
- `packages/analytics/tsconfig.json` — changed to ES2018 target, DOM lib, ESNext module
- `packages/analytics/.gitignore` — negates root dist/ rule to allow committed tracker artifact
