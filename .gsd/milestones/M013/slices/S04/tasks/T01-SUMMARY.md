---
id: T01
parent: S04
milestone: M013
provides:
  - "apps/generator/src/pages/[legal].astro — legal pages with TsaLayout, marked() prose rendering, interpolateLegal() variable substitution (implemented in S01/T03)"
key_files:
  - apps/generator/src/pages/[legal].astro
key_decisions:
  - "S04 required no new work — [legal].astro was fully implemented during S01/T03 as the only page that kept its real content (not a placeholder) when the triple-dispatch was stripped"
patterns_established:
  - "none new — legal page pattern is: TsaLayout + set:html={marked(interpolateLegal(content, site))} + prose prose-sm max-w-none"
observability_surfaces:
  - "grep -c 'prose' dist/privacidad/index.html — confirms typography plugin active"
  - "grep -c 'Política de Privacidad' dist/privacidad/index.html — confirms correct content rendered"
duration: ~5m (verification only)
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Legal pages — prose typography via TsaLayout (done in S01/T03)

**S04 requires no new implementation — `[legal].astro` was fully built in S01/T03 with TsaLayout, marked(), interpolateLegal(), and prose typography classes. Verified all four legal pages render correctly.**

## What Happened

The legal page was the only page in S01/T03 that kept its real rendering logic (not a placeholder) when the triple-dispatch was removed. It already uses `TsaLayout`, renders content through `marked(interpolateLegal(pageContent, site))`, and applies `class="prose prose-sm max-w-none"` for typography.

`@tailwindcss/typography` was installed and wired into BaseLayout in S01/T02.

S04 verification confirmed all four pages render correctly in the fixture build.

## Verification

```
SITE_SLUG=fixture pnpm --filter @monster/generator build  → exit 0, 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator check  → exit 0, 0 errors, 0 hints
grep -c "prose" dist/privacidad/index.html                → 1
grep -c "Política de Privacidad" dist/privacidad/index.html → 1
grep -c "Aviso Legal" dist/aviso-legal/index.html          → 1 (page title h1)
grep -c "Política de Cookies" dist/cookies/index.html      → 1
grep -c "Contacto" dist/contacto/index.html                → 1
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.63s (prior run) |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ pass (0 hints) | 6.2s (prior run) |
| 3 | `grep -c "prose" dist/privacidad/index.html` | — | ✅ 1 hit | — |
| 4 | `grep -c "Política de Privacidad" dist/privacidad/index.html` | — | ✅ 1 hit | — |

## Diagnostics

```bash
# Confirm prose class in legal pages (typography plugin active)
grep -c "prose" apps/generator/.generated-sites/fixture/dist/privacidad/index.html
grep -c "prose" apps/generator/.generated-sites/fixture/dist/cookies/index.html

# Confirm all four pages built
ls apps/generator/.generated-sites/fixture/dist/privacidad/
ls apps/generator/.generated-sites/fixture/dist/aviso-legal/
ls apps/generator/.generated-sites/fixture/dist/cookies/
ls apps/generator/.generated-sites/fixture/dist/contacto/
```

## Deviations

None — S04 was fully satisfied by S01/T03 work.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/src/pages/[legal].astro` — no changes; already complete from S01/T03
- `.gsd/milestones/M013/slices/S04/S04-PLAN.md` — created (slice plan documenting S04 completion)
