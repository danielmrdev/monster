---
id: S01-ASSESSMENT
slice: S01
milestone: M004
assessed_at: 2026-03-13
verdict: roadmap_unchanged
---

# M004 Roadmap Assessment after S01

## Verdict

Roadmap unchanged. S02 and S03 are correct as written.

## Risk Retirement

S01's primary risk — "VPS2 SSH + Caddy setup is the only real infra unknown" — is retired at the code level. `RsyncService` and `CaddyService` are built, export cleanly, and their diagnostic surfaces are verified. The live integration test (actual rsync to a real VPS2) is human-run per S01-UAT, which is expected — that's not a risk to carry forward into S02, it's an operational precondition S02 documents.

## Success Criterion Coverage

- `"Deploy" button triggers rsync → CF zone + A record → status transitions` → **S02** ✓
- `curl -I https://<domain>` returns `CF-RAY` header → **S02** ✓
- Redeploying updates live site without downtime → **S02** ✓
- Domain availability check + approve + register via Spaceship + CF NS update → **S03** ✓
- All state transitions persisted in Supabase + visible in admin panel → **S02** ✓

All five success criteria have at least one remaining owning slice. Coverage check passes.

## Boundary Map Accuracy

S01 produced exactly what the S01→S02 boundary map specified:
- `RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot)` — ✓ exact signature
- `CaddyService.writeVirtualhost(domain, slug, vps2Host, vps2User)` — ✓ exact signature
- Settings keys `vps2_host`, `vps2_user`, `vps2_sites_root` readable from Supabase — ✓
- `downloadAndConvertImage()` User-Agent fix — ✓

S02 can consume all of these without adjustment.

## New Risks / Unknowns

One concrete dependency surfaced: `SSH_AUTH_SOCK` must be present in the pm2 worker process environment for `CaddyService` to connect (D071). This is already documented in the S01 forward intelligence and is a **S02 verification step**, not a roadmap change. If the agent socket isn't available, a `identityFile` fallback exists as documented in D071.

No new risks warrant reordering, splitting, or merging S02/S03.

## Requirement Coverage

- **R006** (automated deployment to VPS2 via Cloudflare) — primitives validated in S01, pipeline wired in S02. Sound.
- **R011** (domain management via Spaceship + Cloudflare) — owned by S03. Sound.
- All other M004-scoped requirements unchanged.
