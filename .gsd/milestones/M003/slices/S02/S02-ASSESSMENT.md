---
id: S02-ASSESSMENT
slice: S02
milestone: M003
assessed_at: 2026-03-13
verdict: no_changes_needed
---

# Roadmap Assessment After S02

## Verdict

Roadmap is good. S03 and S04 proceed as written.

## Success Criterion Coverage

- `User clicks "Generate Site" → BullMQ job runs → site built without error` → S03, S04 ✓
- `Built site renders all page types correctly` → S03, S04 ✓
- `All product images are local WebP files (no hotlinked Amazon URLs)` → S02 enforced structurally (D054); UA-header fix to make images actually download is S03 scope per forward intelligence ✓
- `All content is AI-generated in the site's configured language` → S03 ✓
- `Every generated page has an SEO score persisted in Supabase and visible in site detail` → S04 ✓
- `All pages score ≥70` → S04 ✓
- `BullMQ job handles failure gracefully, idempotent` → S02 established idempotency patterns; S03 must extend them (skip if content already written, incremental writes to Supabase) ✓

All criteria have at least one remaining owning slice. Coverage check passes.

## Risk Retirement

S02 retired the DataForSEO Merchant API response shape risk as planned — the async task_post → poll → task_get cycle is implemented, field mapping is written to documented spec, and the `items[0]` shape log is wired for first-call validation. The one caveat: `data_asin` field mapping has not been validated against a live API call (credentials pending). The shape log will surface any mismatch on the first real job run. This is an acceptable deferred validation, not a plan-invalidating gap.

## S03 Boundary Contract Check

S03 consumes: real `tsa_categories`/`tsa_products` rows in Supabase with ASINs, titles, prices. These are produced by S02 upserts. ✓

S03 produces: `focus_keyword`, `detailed_description`, `pros_cons`, `opinion_summary`, `meta_description` written to Supabase rows. The existing `GenerateSiteJob` SiteData assembly (D056 — assembled from DB rows post-upsert) picks these up with no code changes needed. ✓

S03 idempotency extension: S03 must skip content generation if `focus_keyword` already exists on a row (same pattern as `existsSync` in the image pipeline). The S02 boundary map documents this requirement; the S03 slice description covers it ("content persisted incrementally to Supabase before Astro build").

## S04 Boundary Contract Check

S04 consumes: real AI-content-enriched `dist/` HTML files with `focus_keyword` available from DB. Both are produced by S03. ✓

## Known Limitations Carried Forward

- **Amazon CDN 403 (D052):** `tsa_products.images` will be `[]` until S03 adds `User-Agent` header to `downloadAndConvertImage()`. Product pages will render without images in any build that runs before the fix. S02 forward intelligence documents the exact one-line fix. S03 should apply it as part of wiring the content phase.
- **`data_asin` field name:** Not live-validated. First real job run will log raw `items[0]` shape — if the field is named differently, products will have null ASINs and the job will produce zero content (detectable immediately).
- **Live end-to-end run not yet executed:** DataForSEO credentials must be configured in admin Settings first. No plan changes implied — this is an operational prerequisite for UAT, not a code gap.

## Requirement Coverage

Requirement ownership unchanged from pre-S02 roadmap:
- R001 (end-to-end pipeline): S03 + S04 complete the remaining phases
- R004 (AI content generation): S03 owns this
- R005 (SEO Scorer): S04 owns this
- R015 (3 TSA templates): validated in S01, advanced in S02 with real product data

No requirements invalidated, newly surfaced, or requiring reallocation.
