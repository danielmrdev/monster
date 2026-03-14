# GSD State

**Active Milestone:** M004 — Deployment + Cloudflare
**Active Slice:** S02 — Cloudflare Automation + Deploy Pipeline
**Phase:** execution
**Requirements Status:** 15 active · 4 validated · 6 deferred · 3 out of scope

## Milestone Registry
- ✅ **M001:** Foundation
- ✅ **M002:** Admin Panel MVP
- ✅ **M003:** TSA Site Generator
- 🔄 **M004:** Deployment + Cloudflare
- ⬜ **M005:** M005
- ⬜ **M006:** M006
- ⬜ **M007:** M007
- ⬜ **M008:** M008

## Recent Decisions
- D074: `node-ssh` and `cloudflare` externalized in agents tsup config (bundling constraint)
- D075: `domains` upsert uses `onConflict: 'domain'` (UNIQUE on domain column, not composite)

## Blockers
- None

## Next Action
Execute S02 — start with T01 (set up `packages/domains` + `CloudflareClient`).
