---
verdict: pass
remediation_round: 0
---

# Milestone Validation: M014

## Success Criteria Checklist

- [x] **Logo PNG upload in edit form → stored as WebP, used in generated site**
  Evidence: `POST /api/sites/[id]/upload-logo` route handler exists; sharp 0.33.5 added to `apps/admin/package.json`; PNG/JPEG→WebP via `sharp().webp({ quality: 80 })`; writes to `public/uploads/sites/[id]/logo.webp`; hidden input carries path to `updateSite`; `customization.logoUrl` stored as `/uploads/sites/<id>/logo.webp`. Fixture `site.json` has `.site.customization.logoUrl` set. Generator `generate-site.ts` section 5b copies logo to `dist/logo.webp` via `copyFileSync`.

- [x] **Favicon ZIP upload → extracted, copied to dist/ at generation, manifest link in `<head>`**
  Evidence: `POST /api/sites/[id]/upload-favicon` route handler exists; adm-zip 0.5.16 installed; extracts flat entries to `public/uploads/sites/[id]/favicon/`; `customization.faviconDir` stored; fixture `site.json` has `faviconDir` set; fixture public/ contains all 5 files (`logo.webp`, `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`, `site.webmanifest`). `BaseLayout.astro` renders 4 `<link>` tags (icon, icon/png, apple-touch-icon, manifest) when `faviconDir` is truthy. S02 verification confirmed `grep 'rel="manifest"' dist/index.html` → `<link rel="manifest" href="/site.webmanifest">`.

- [x] **Generate Site and Deploy buttons live in Deploy tab, not in page header**
  Evidence: Page header JSX (`~line 185+`) contains only Preview and Edit buttons. `deploySlot` const (`lines 88–178`) contains `<GenerateSiteButton siteId={site.id} />` and the Deploy form/button above `<DeployStatus>`. `grep "GenerateSiteButton\|enqueueSiteDeploy" page.tsx` confirms both appear only in `deploySlot`, not in the header section.

- [x] **Product refresh interval configurable in edit form and visible in Deploy tab**
  Evidence: `edit-form.tsx` has a number input (`name="refresh_interval_days"`, `defaultValue={Math.round(site.refresh_interval_hours / 24)}`). `actions.ts` reads days, converts to hours (`Math.max(1, isNaN(rawDays) ? 2 : rawDays) * 24`), writes `refresh_interval_hours` to DB. `page.tsx` Deploy slot shows "Refresh interval: N days" at line 96–97. `edit/page.tsx` passes `refresh_interval_hours` with `?? 48` null guard.

- [x] **Categories tab shows description + product count; category detail page shows per-category products + search**
  Evidence: `SiteDetailTabs.tsx` tab trigger uses `value="categories"` with label "Categories" (line 111). `CategoriesSection.tsx` has `description: string | null` and `productCount: number` in its interface; renders description text and product count badge per row; each row is a `<Link>` to `/sites/[id]/categories/[catId]`. New pages exist: `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` and `CategoryProductsSection.tsx` (search + pagination). API route `GET /api/sites/[id]/categories/[catId]/products` exists.

- [x] **SEO scores exclude `/go/**` and legal pages; legend card explains each dimension**
  Evidence: `generate-site.ts` line 482: `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;` at top of scoring loop. `SiteDetailTabs.tsx` line 278: `<Card title="SEO Score Dimensions">` with 8-item grid (Content, Meta, Structure, Links, Media, Schema, Technical, Social) rendered before the SEO Scores table (line 298).

- [x] **hel1 InfraService returns real metrics (not SSH error)**
  Evidence: `packages/deployment/src/infra.ts` has `is_local: boolean` parameter in `checkServerHealth()` (line 166); when `server.is_local === true`, calls private `checkServerHealthLocal()` (line 169) which runs `execSync` for Caddy status, disk usage, and memory. DB migration `20260318120000_servers_is_local.sql` adds `is_local boolean NOT NULL DEFAULT false`. `packages/db/src/types/supabase.ts` updated with `is_local: boolean` in `servers.Row`. Note: operator must manually set `is_local=true` on the hel1 row to activate (documented in S06 known limitations).

---

## Slice Delivery Audit

| Slice | Claimed | Delivered | Status |
|-------|---------|-----------|--------|
| S01 | Logo PNG→WebP upload route; ZIP favicon upload route; edit form file widgets with hidden input carry-through; sharp/adm-zip deps | Both route handlers verified (curl tests in summary). Edit form file inputs replace text fields. `customization.logoUrl`/`faviconDir` stored correctly. sharp externalized. Both builds exit 0. | ✅ pass |
| S02 | `faviconDir` in `SiteCustomization`; `generate-site.ts` section 5b copy block; `BaseLayout.astro` 4 favicon `<link>` tags; fixture build with dist/ assets + HTML link tags | `data.ts` updated. Section 5b exists with `copyFileSync`/`cpSync`. All 4 `<link>` tags in `BaseLayout.astro`. Fixture public/ seeded with 5 files. S02 verification table (7 checks) all passed: 15-page build, dist/ files, HTML greps. | ✅ pass |
| S03 | Generate/Deploy from header→deploySlot; `refresh_interval_hours` wired edit form→action→DB→Deploy tab display | Header contains only Preview+Edit. deploySlot has both buttons + refresh display. actions.ts converts days→hours. tsc --noEmit exit 0. All 8 verification greps passed. | ✅ pass |
| S04 | "Categories" tab rename; description + product count per row; category detail page `/sites/[id]/categories/[catId]`; `productsSlot` removed | Tab renamed. CategoriesSection updated with description + badge. Detail page + CategoryProductsSection + API route all created. `productsSlot` absent from SiteDetailTabs. tsc --noEmit exit 0. | ✅ pass |
| S05 | Skip guard in scoring loop for `/go/` + legal; legend card with 8 dimensions above SEO Scores table | Skip guard at line 482 confirmed. Legend card at line 278 before SEO Scores table (line 298). 8 dimensions present. tsc --noEmit exit 0. | ✅ pass |
| S06 | `is_local` migration + DB types; InfraService `checkServerHealthLocal()` private method; DomainManagement `siteId?` optional; Research Lab DomainManagement card; Deploy tab domain slot removed | Migration file exists + applied. supabase.ts updated (3 is_local matches). `checkServerHealthLocal` private method with execSync branches. DomainManagement `siteId?: string`. Research Lab imports and renders `<DomainManagement />`. SiteDetailTabs has no `domainSlot`. tsc --noEmit exit 0. | ✅ pass |

---

## Cross-Slice Integration

**S01 → S02 boundary:**
- S01 produces `customization.logoUrl` as `/uploads/sites/<id>/logo.webp` — S02 `generate-site.ts` reads `join(adminPublicRoot, logoSrc)` correctly consuming this convention ✅
- S01 produces `customization.faviconDir` as `/uploads/sites/<id>/favicon` — S02 section 5b uses `cpSync` to copy the directory ✅
- S01 produces `faviconDir` in `SiteCustomizationSchema`; S02 mirrors this in `SiteCustomization` interface in `data.ts` ✅
- `tsa/Layout.astro` threads `faviconDir={site.customization.faviconDir}` to `BaseLayout` ✅

**S04 → S05/S06 (independence):**
- S04 removed `productsSlot` from SiteDetailTabs — S05 and S06 summaries confirm they operate on `SiteDetailTabs.tsx` without referencing `productsSlot` ✅
- S06 removed `domainSlot` from SiteDetailTabs — no conflict with S04's tab changes ✅

**Known integration gap (not blocking):**
- S02 section 5b copy code in `generate-site.ts` is only exercised during BullMQ job execution, not via bare `astro build`. The fixture public/ pre-seeding proves the correct dist/ output, but live BullMQ job proof with real S01-uploaded assets is deferred to human UAT. This is documented in S02 known limitations and is consistent with the milestone's operational validation class.

---

## Requirement Coverage

Requirements directly addressed by M014:

| Req | Description | Coverage |
|-----|-------------|----------|
| R001 | idea → live site pipeline | Advanced: logo/favicon assets complete the end-to-end branding pipeline; logoUrl and faviconDir flow through upload→storage→generator→dist. Full validation requires live BullMQ job run. |
| R015 | TSA template branding (logo, favicon) | Advanced: BaseLayout renders 4 favicon `<link>` tags; `logo.webp` copied to dist/. R015 itself is already validated (M013); M014 closes the upload UX gap. |
| R005 | SEO scoring quality | Advanced: scoring loop now excludes `/go/` redirect stubs and legal pages — improves score data quality for content pages. |

No M014-adjacent active requirements were introduced or invalidated by this milestone.

---

## Verdict Rationale

All 6 slices delivered their contracted outputs. Every success criterion in the roadmap is met by verified code evidence:

1. **File existence and content** confirmed: upload route handlers, migration file, fixture public/ assets, category detail page + API route, new Astro link tags.
2. **TypeScript integrity** confirmed: `cd apps/admin && npx tsc --noEmit` exits 0 (zero output) after all slice changes.
3. **Key behavior confirmed by grep**: skip guard at correct position in scoring loop; Generate/Deploy buttons absent from header; `domainSlot` absent from SiteDetailTabs; `productsSlot` fully removed; legend card precedes SEO Scores card.
4. **Cross-slice boundary contracts** align: `customization.logoUrl`/`faviconDir` path conventions established in S01 consumed correctly by S02.

The only open item — live BullMQ job proof of section 5b logo/favicon copy — is a runtime operational closure, not a code defect. It is explicitly documented as a known limitation in S02 and consistent with the milestone's proof strategy ("retire in S02 by building the fixture site and checking dist/ root + `<head>` HTML"). The fixture build and verification table (7/7 checks passed) satisfies the contract verification class.

**Verdict: pass**

---

## Remediation Plan

N/A — verdict is `pass`. No remediation slices required.
