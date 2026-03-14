# GSD State

**Active Milestone:** M005 — Analytics
**Active Slice:** S01 — Tracker Script + Astro Injection
**Phase:** planned — T01 next
**Requirements Status:** 15 active · 4 validated · 6 deferred · 3 out of scope

## Milestone Registry
- ✅ **M001:** Foundation
- ✅ **M002:** Admin Panel MVP
- ✅ **M003:** TSA Site Generator
- ✅ **M004:** Deployment + Cloudflare
- 🔄 **M005:** Analytics
- ⬜ **M006:** Product Refresh
- ⬜ **M007:** Monster Chat + NicheResearcher
- ⬜ **M008:** Finances

## Recent Decisions
- D084: Tracker POST transport — `fetch` with `keepalive: true`, not `sendBeacon` (sendBeacon can't set custom headers required by PostgREST)
- D085: Tracker placeholder substitution — literal strings in source, string-replaced at Astro build time in `BaseLayout.astro`

## Blockers
- None

## Next Action
Execute T01: Build tracker script with esbuild.
