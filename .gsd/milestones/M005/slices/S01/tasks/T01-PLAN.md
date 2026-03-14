---
estimated_steps: 6
estimated_files: 3
---

# T01: Build tracker script with esbuild

**Slice:** S01 — Tracker Script + Astro Injection
**Milestone:** M005

## Description

Write the browser-side analytics tracker in TypeScript and build it to a single minified IIFE ≤2048 bytes using esbuild. The script must work without any external imports (pure browser globals), implement visitor hashing via Web Crypto API with a Math.random fallback for non-HTTPS contexts, fire a `pageview` event on load, queue events and flush them via `sendBeacon` with a `Blob` wrapper (required for PostgREST to accept `application/json`), and intercept clicks on `[data-affiliate]` links. The built artifact is committed to the repo so the generator consumes it without a workspace dependency.

## Steps

1. Add `esbuild` as a `devDependency` to `packages/analytics/package.json`. Add a `build` script that runs `esbuild src/tracker.ts --bundle --minify --format=iife --platform=browser --target=es2017 --outfile=dist/tracker.min.js`. Add a `typecheck` script: `tsc --noEmit`. Update `tsconfig.json` to use `lib: ["ES2017", "DOM"]` and `target: "ES2017"` so Web Crypto types are available.

2. Write `packages/analytics/src/tracker.ts`. The script reads `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, `__SITE_ID__` as literal string placeholders (esbuild will keep them as bare string literals in the IIFE; `BaseLayout.astro` will replace them via string substitution at Astro build time). The script must:
   - Compute `visitor_hash`: `crypto.subtle` is available only in secure contexts. Check `window.isSecureContext && crypto.subtle` — if unavailable, fall back to a 16-char hex from `Math.random()`. Hash input: `YYYY-MM-DD` + `navigator.userAgent` (SHA-256, hex-encoded).
   - On `DOMContentLoaded` (or immediately if already loaded): enqueue a `pageview` event with `{ site_id, event_type: 'pageview', page_path: location.pathname, referrer: document.referrer, visitor_hash, language: navigator.language, country: null }`.
   - On `document.querySelectorAll('[data-affiliate]')` click: enqueue a `click_affiliate` event.
   - Flush queue via `sendBeacon` using `new Blob([JSON.stringify(events)], { type: 'application/json' })` POST to `${SUPABASE_URL}/rest/v1/analytics_events` with headers `apikey` and `Content-Type` in the Blob (note: sendBeacon doesn't support custom headers — use `fetch` with `keepalive: true` as the flush mechanism instead, which supports headers).
   - Send on `visibilitychange` (when `document.visibilityState === 'hidden'`) and `pagehide`. Also send any queued events every 5 seconds if the queue is non-empty.
   - Use `fetch` with `keepalive: true` (not sendBeacon) as the actual POST transport since PostgREST requires `Authorization` and `apikey` headers that sendBeacon cannot set. Wrap in try/catch — failures must be silent.

3. Run `pnpm --filter @monster/analytics build`. Inspect the output size. If over 2048 bytes, check for unnecessary code: the tracker has no imports and no type information in the output — the only bloat would be esbuild overhead or overly verbose JS. Trim any unnecessary logic. Consider removing `console.debug` calls if needed for byte budget.

4. Verify byte count: `wc -c packages/analytics/dist/tracker.min.js`. Must be ≤2048.

5. Run `pnpm --filter @monster/analytics build` — confirm exit 0.

6. Commit `dist/tracker.min.js` to the repo (it's a build artifact but intentionally committed per D079).

## Must-Haves

- [ ] `packages/analytics/package.json` has `build` script using esbuild
- [ ] `packages/analytics/src/tracker.ts` exists with all required logic
- [ ] `dist/tracker.min.js` ≤ 2048 bytes
- [ ] `pnpm --filter @monster/analytics build` exits 0
- [ ] Visitor hash uses SubtleCrypto with Math.random fallback
- [ ] Event POST uses `fetch` with `keepalive: true` and `apikey`/`Authorization` headers
- [ ] Blob wrapping is used if sendBeacon is kept (but fetch+keepalive is the primary transport)
- [ ] No external imports in the tracker source — pure browser globals only
- [ ] `dist/tracker.min.js` committed to repo

## Verification

- `pnpm --filter @monster/analytics build` exits 0
- `stat -c%s packages/analytics/dist/tracker.min.js` outputs a number ≤ 2048
- `head -c 100 packages/analytics/dist/tracker.min.js` shows minified JS (not human-readable source)
- `grep -c "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js` outputs 3 (placeholders preserved in built output)

## Observability Impact

- Signals added: tracker will `fetch` to Supabase `analytics_events` with `keepalive: true`; failed fetches are silent (fire-and-forget)
- How a future agent inspects this: Supabase table editor → `analytics_events` table → check for rows with `site_id` matching the test site; browser DevTools Network tab → filter by `analytics_events` endpoint
- Failure state exposed: if byte count >2048 or placeholders not preserved, this task is not done — re-examine esbuild config

## Inputs

- `packages/analytics/package.json` — empty shell, needs esbuild dependency and build script
- `packages/analytics/tsconfig.json` — needs DOM lib target for Web Crypto types
- M005 roadmap: D079 (committed artifact), D080 (visitor hash design), D081 (country=null), Blob sendBeacon risk note

## Expected Output

- `packages/analytics/src/tracker.ts` — browser tracker source with placeholder strings
- `packages/analytics/dist/tracker.min.js` — built, minified, ≤2048 bytes, committed
- `packages/analytics/package.json` — updated with esbuild devDep and build script
