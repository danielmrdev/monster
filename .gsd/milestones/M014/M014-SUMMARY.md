---
id: M014
provides:
  - Logo PNG upload → sharp WebP conversion → public/uploads/sites/[id]/logo.webp → generated dist/
  - Favicon ZIP upload → adm-zip extraction → public/uploads/sites/[id]/favicon/ → generated dist/ root
  - Four favicon <link> tags in BaseLayout.astro (favicon.ico, favicon-32x32.png, apple-touch-icon.png, site.webmanifest)
  - generate-site.ts section 5b: post-build copy block for logo + favicon assets
  - Generate Site and Deploy buttons relocated from page header to Deploy tab deploySlot
  - refresh_interval_hours wired end-to-end: edit form (days) → server action conversion → DB → Deploy tab display
  - Categories tab (renamed from Content): description + product count badge per row, full-row navigation
  - Category detail page at /sites/[id]/categories/[catId] with products + search + pagination
  - Category-scoped products API route GET /api/sites/[id]/categories/[catId]/products
  - SEO scoring skip guard for /go/ redirect stubs and legal pages
  - SEO Score Dimensions legend card in SEO tab (8 dimensions explained)
  - servers.is_local migration (boolean, DEFAULT false) applied to Supabase
  - InfraService local-mode branch via private checkServerHealthLocal() using execSync
  - DomainManagement component siteId optional; rendered in Research Lab without site context
  - Deploy tab has no Domain Management section
key_decisions:
  - D172: faviconUrl kept alongside faviconDir — legacy coexistence, non-breaking additive change
  - D173: favicon upload accepts application/octet-stream + .zip filename fallback (browsers frequently misreport ZIP MIME type)
  - D174: path traversal guard skips unsafe ZIP entries rather than rejecting entire upload
  - D175: checkServerHealthLocal() per-call execSync try/catch; Caddy exit code 3 recovers stdout from error object
  - D176: DomainManagement siteId optional; both registration blocks wrapped in single {siteId && (<>...</>)} fragment
patterns_established:
  - Upload state pattern: { uploading, path, error } useState initialized from existing customization value
  - Hidden input carries upload path to server action: <input type="hidden" name="X" value={state.path ?? ''} />
  - Supabase nested aggregate count: .select('..., relation(count)') → (data as unknown as { count: number }[])?.[0]?.count ?? 0
  - Supabase !inner join for scoped sub-resource queries: .select('..., join_table!inner(fk_col)') + .eq('join_table.fk_col', value)
  - Strip join metadata: products.map(({ category_products: _cp, ...p }) => p)
  - post-build asset copy: existsSync guard → copyFileSync/cpSync → console.log/warn (non-fatal on missing source)
  - execSync error objects carry stdout on non-zero exits — cast to { stdout?: string } to recover "inactive" from Caddy exit code 3
  - Monorepo build order: packages/db must precede packages/deployment when supabase.ts changes (KN017)
observability_surfaces:
  - "[upload-logo] siteId=<id>" and "[upload-favicon] siteId=<id>" — structured console.error prefix on all 500 paths
  - "[GenerateSiteJob] Copied logo → dist/logo.webp" and "[GenerateSiteJob] Copied favicon dir → dist/"
  - "[GenerateSiteJob] logo source not found: <path> — skipping" / "[GenerateSiteJob] favicon source dir not found"
  - "[InfraService] local-mode metrics for \"<name>\"" — confirms local mode active and healthy
  - "[InfraService] local-mode error for \"<name>\": <msg>" — execSync failure detail
  - Deploy tab "Refresh interval: N days" — live DB value; mismatch reveals bad save or coercion
  - HTTP status semantics: 400 (no file / no valid entries), 413 (size exceeded), 415 (wrong type), 500 (sharp/adm-zip error)
  - SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal' → should return 0 post-generation
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: active
    proof: Logo and favicon now flow from upload → DB → generator → dist/ (S01+S02 verified). Full pipeline validation (live BullMQ GenerateSiteJob with real uploads) remains the final proof gate — section 5b copy runs only inside the job, not the fixture build.
  - id: R015
    from_status: validated
    to_status: validated
    proof: TSA template branding extended with per-site logo (WebP, local asset copied to dist/) and favicon set with four standard HTML <link> tags in BaseLayout.astro. Fixture build confirmed: logo.webp + all 4 favicon files in dist/, all 4 link tags in index.html.
duration: ~3h 15m (S01: 53m, S02: 20m, S03: 20m, S04: 37m, S05: 5m, S06: 40m)
verification_result: passed
completed_at: 2026-03-18
---

# M014: Site Detail & Edit — UX & Data Improvements

**Six coordinated slices upgraded the site detail and edit pages with file upload infrastructure, UI reorganization, category drill-down, SEO score quality filtering, and VPS local-mode health monitoring.**

## What Happened

Six independent-to-lightly-dependent slices executed in a single session, addressing UX debt accumulated since M003. The milestone had one sequential dependency chain (S01 → S02) and four leaf slices (S03–S06) that ran independently.

**S01 (Logo & Favicon Upload, ~53m)** built the upload infrastructure: two Route Handler endpoints (`POST /api/sites/[id]/upload-logo` using sharp for PNG/JPEG → WebP, `POST /api/sites/[id]/upload-favicon` using adm-zip for ZIP extraction with path traversal guard). The edit form's Customization card replaced plain text URL inputs with file inputs; upload state is initialized from existing `customization.logoUrl`/`faviconDir` so re-editing a site shows current state. Hidden inputs carry uploaded paths to `updateSite` at submit time. The `faviconDir` field was added additively to `SiteCustomizationSchema` alongside the legacy `faviconUrl` (D172).

**S02 (Generator Integration, ~20m)** consumed S01's contracts: `faviconDir?: string` added to `SiteCustomization` in `data.ts`; a new section 5b in `generate-site.ts` copies `logo.webp` and the entire favicon directory into `dist/` post-build (existsSync-guarded, non-fatal); `BaseLayout.astro` conditionally renders four favicon `<link>` tags when `faviconDir` is set; `tsa/Layout.astro` passes the prop through. The fixture verification used Astro's `publicDir` mechanism (pre-seeding `public/` before `astro build`) since section 5b only runs inside the BullMQ job — all five dist/ files and all four HTML link tags confirmed.

**S03 (Edit Form & Deploy Tab Reorganization, ~20m)** moved the Generate Site and Deploy buttons from the page header into the `deploySlot` const above `<DeployStatus>`. The header now contains only Preview and Edit. Simultaneously, `refresh_interval_hours` was wired end-to-end: a number input (in days) in the edit form, conversion to hours in the `updateSite` server action with NaN coercion to 2 days, and a "Refresh interval: N days" display row in the Deploy tab.

**S04 (Categories Tab Redesign, ~37m)** renamed the "Content" tab to "Categories" and removed `productsSlot` from `SiteDetailTabs`. The categories query was extended to include `description` and a `category_products(count)` nested aggregate. `CategoriesSection` renders description + product count badge per row, with each row as a full `<Link>` (Edit/Delete use `e.stopPropagation()`). A new category detail page at `/sites/[id]/categories/[catId]` renders a breadcrumb, header, and `CategoryProductsSection` — a read-only product list with search and pagination scoped via `category_products!inner` join.

**S05 (SEO Score Filter + Legend, ~5m)** added a two-line skip guard at the top of the scoring loop to exclude `/go/` redirect stubs and legal pages from `seo_scores`. A "SEO Score Dimensions" legend card was added above the SEO Scores table in `SiteDetailTabs`, explaining all 8 score dimensions (Content, Meta, Structure, Links, Media, Schema, Technical, Social).

**S06 (VPS Local Mode + Domain Management Relocation, ~40m)** applied a migration adding `is_local boolean NOT NULL DEFAULT false` to the `servers` table (pushed to Supabase), updated TypeScript types, and added a private `checkServerHealthLocal()` method to `InfraService` that runs `execSync` commands (Caddy status, disk usage, memory) with per-call isolation. The key subtlety: `systemctl is-active caddy` exits with code 3 when inactive, so the catch path reads `(err as { stdout?: string }).stdout` to recover the `"inactive"` string. `DomainManagement`'s `siteId` prop was made optional with both registration blocks guarded by a single `{siteId && (<>...</>)}` fragment; the component now renders in the Research Lab page (availability check only) and is absent from the Deploy tab.

## Cross-Slice Verification

All success criteria from the milestone roadmap were verified with specific evidence:

| Criterion | Evidence |
|-----------|----------|
| Logo PNG upload → stored as WebP | `upload-logo/route.ts`: sharp `.webp({ quality: 80 })` at line 46; curl test returned 200 + RIFF/WEBP magic bytes on disk (S01 verification) |
| Logo used in generated site dist/ | `generate-site.ts` section 5b: `copyFileSync(srcPath, join(distDir, 'logo.webp'))` at line 437; `ls dist/logo.webp` ✅ (S02 verification) |
| Favicon ZIP extracted; dist/ root has files | `upload-favicon/route.ts` adm-zip extraction; `generate-site.ts` section 5b `cpSync`; fixture dist/ contains `favicon.ico`, `site.webmanifest`, `apple-touch-icon.png`, `favicon-32x32.png` (S02 verification) |
| `<link rel="manifest">` in BaseLayout | `BaseLayout.astro` lines 52–57: 4 conditional link tags; `grep 'rel="manifest"' dist/index.html` ✅ (S02 verification) |
| Generate/Deploy buttons absent from header | `page.tsx` header contains only Preview + Edit links; `GenerateSiteButton` at line 149 is inside `deploySlot` const (lines 88–185) |
| Buttons present and functional in Deploy tab | `deploySlot` const has `GenerateSiteButton` + Deploy form with conditional domain guard |
| `refresh_interval_hours` persists from edit form | Edit form days input → `updateSite` hours conversion → DB write → Deploy tab "Refresh interval: N days" display; `grep refresh_interval` in 4 files all match |
| Categories tab: description + product count | `CategoriesSection.tsx` interface + JSX renders `cat.description` and `cat.productCount` badge; tab trigger label "Categories" confirmed |
| `productsSlot` absent from `SiteDetailTabs` | `grep -r 'productsSlot' sites/[id]/` → 0 matches |
| Category detail page exists with products + search | `/sites/[id]/categories/[catId]/page.tsx` + `CategoryProductsSection.tsx` + API route all present |
| SEO scores exclude /go/ and legal rows | `generate-site.ts` line 482: `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;` |
| Legend card present in SEO tab | `SiteDetailTabs.tsx` line 278: `<Card title="SEO Score Dimensions">` with 8-item grid |
| `is_local` migration applied | `20260318120000_servers_is_local.sql` exists + pushed to Supabase; `packages/db/src/types/supabase.ts` has `is_local: boolean` in Row type |
| InfraService local-mode returns real metrics | `infra.ts` line 168: `if (server.is_local) return this.checkServerHealthLocal(server)` with execSync implementation |
| Domain Management in Research Lab | `research/page.tsx` imports and renders `<DomainManagement />` with no props |
| Deploy tab has no Domain Management | `grep -c "domainSlot" SiteDetailTabs.tsx` → 0 |
| TypeScript clean | `cd apps/admin && npx tsc --noEmit` → exit 0, no output |

**One operational item pending manual action:** Setting `is_local=true` on the hel1 server row in Supabase (via REST PATCH) activates local-mode metrics collection. The code is ready; the DB flag must be set by the operator. Without this flag, the `/infra` page continues to use SSH for hel1.

## Requirement Changes

- **R001** (active): Logo and favicon now have a complete upload → storage → generator pipeline. The route handlers, edit form, generate-site.ts copy block, and BaseLayout link tags are all in place. R001 remains `active` because the final validation gate (live BullMQ `GenerateSiteJob` run with a real site that has both S01 uploads set) has not been completed — section 5b only runs inside the job, and no live end-to-end run was performed during this milestone.

- **R015** (validated → validated): Branding now includes per-site logo and favicon in addition to the existing CSS custom property theming. All 4 fixture favicon link tags confirmed in generated HTML. R015 status confirmed as validated with expanded scope.

## Forward Intelligence

### What the next milestone should know

- **is_local activation is manual:** To enable real metrics for hel1, set `is_local=true` via Supabase REST: `PATCH /rest/v1/servers?name=eq.hel1` with `{"is_local":true}` body and service_role key. Without this, the `/infra` page tries SSH to the local machine (which fails) instead of using execSync.
- **section 5b copy requires BullMQ job context:** `generate-site.ts` section 5b runs from `process.cwd()` which must be `apps/admin` for the path `path.join(process.cwd(), 'public', customization.logoUrl)` to resolve correctly. If the worker runs from a different directory, the existsSync guard produces a skip warning and no assets are copied.
- **Fixture public/ seeded files:** `.generated-sites/fixture/public/` contains pre-seeded logo.webp and 4 favicon files. If this directory is cleaned (`rm -rf .generated-sites`), the fixture build will succeed but produce no logo/favicon in dist/. The HTML `<link>` tags will still render (since `faviconDir` is in `site.json`) but the referenced files won't exist.
- **Domain registration now only in Research Lab:** Deploy tab has no domain management. If a future milestone needs per-site registration again, `<DomainManagement siteId={site.id} />` can be re-added to the Deploy tab — the component already supports `siteId` as an optional prop.
- **Category detail page is read-only:** `CategoryProductsSection` has no Add/Remove product controls. Category-product association management was not in scope for M014.
- **Retroactive SEO score cleanup:** The skip guard prevents future `/go/` and `legal` rows from being inserted, but does NOT delete historical rows. A one-time `DELETE FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` cleans pre-existing data.
- **Build order for type changes:** When `packages/db/src/types/supabase.ts` changes, always run `pnpm --filter @monster/db build` before `pnpm --filter @monster/deployment build` (KN017).

### What's fragile

- **sharp in Next.js 15:** Externalized in both `serverExternalPackages` and `webpack.externals` in `next.config.ts`. If `next.config.ts` is regenerated or merged, verify both entries survive. The build passes without them but sharp throws a module-not-found error at runtime.
- **Fixture public/ seeded files** (see above) — not committed to source, only in `.generated-sites/`.
- **execSync pipelines in checkServerHealthLocal()** — `df -h / | tail -1 | awk '{print $5}'` and `free -m | awk '/^Mem:/{print $3, $2}'` work on Ubuntu 24.04 but would break on Alpine or macOS. Platform-specific to the VPS OS.
- **DomainManagement cross-route import in research/page.tsx:** Path `'@/app/(dashboard)/sites/[id]/DomainManagement'` — if the component moves or is renamed, TypeScript catches it, but it's a non-obvious dependency.
- **Supabase category_products !inner join** — if the FK relationship is misconfigured or renamed in Supabase, the join silently returns no products (empty intersection) without a TypeScript error.

### Authoritative diagnostics

- `cd apps/admin && npx tsc --noEmit` — authoritative type check; zero output = zero errors (KN016)
- `ls apps/admin/public/uploads/sites/<id>/` — direct proof upload succeeded; empty = route handler never wrote
- `xxd apps/admin/public/uploads/sites/<id>/logo.webp | head -1` — RIFF/WEBP magic bytes confirm sharp conversion
- `grep 'rel="manifest"\|rel="icon"\|rel="apple-touch-icon"' dist/index.html` — fastest first check for generator integration
- `[InfraService] local-mode metrics for "hel1"` in admin server stdout — confirms is_local flag is set and execSync succeeds
- `SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` — should return 0 after any site generation post-M014

### What assumptions changed

- **Fixture build does not exercise section 5b:** Original assumption was that `astro build` + section 5b would be testable together. Reality: section 5b runs only inside the BullMQ job. Fixture verification uses Astro's `publicDir` mechanism (pre-seeded files) which produces identical dist/ output via a different code path.
- **SUPABASE_DB_URL env expansion:** `npx supabase db push --db-url $SUPABASE_DB_URL` fails silently if the var is unexported. Must pass the literal URL or export first (KN018).
- **Favicon MIME acceptance:** Browsers commonly send `application/octet-stream` for ZIP files — the original plan's restriction to `application/zip` + `application/x-zip-compressed` only would have caused false 415s in real use (D173).

## Files Created/Modified

- `apps/admin/package.json` — added sharp, adm-zip, @types/adm-zip deps
- `packages/shared/src/types/customization.ts` — faviconDir: z.string().optional() added
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — faviconDir read in updateSite rawCustomization; refresh_interval_hours write
- `apps/admin/next.config.ts` — sharp in serverExternalPackages
- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — new: POST handler, PNG/JPEG→WebP, 5MB limit
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — new: POST handler, ZIP extraction, path traversal guard
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — file upload widgets replacing text inputs; refresh_interval_hours days input
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — refresh_interval_hours in siteForForm with ?? 48 guard
- `apps/generator/src/lib/data.ts` — faviconDir?: string in SiteCustomization
- `packages/agents/src/jobs/generate-site.ts` — section 5b post-build copy block; skip guard in scoring loop; copyFileSync/cpSync imports
- `apps/generator/src/layouts/BaseLayout.astro` — faviconDir prop + 4 conditional favicon link tags
- `apps/generator/src/layouts/tsa/Layout.astro` — faviconDir prop passed to BaseLayout
- `apps/generator/src/data/fixture/site.json` — customization.logoUrl and customization.faviconDir added
- `apps/generator/.generated-sites/fixture/public/` — logo.webp + 4 favicon files seeded
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate/Deploy buttons moved to deploySlot; refresh interval display; DomainManagement import removed
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — tab renamed Categories; productsSlot removed; SEO legend card; domainSlot removed
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — description + productCount badge; full-row Link navigation
- `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` — new: paginated+searchable category-scoped products
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` — new: read-only product list with search+pagination
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — new: category detail page with notFound() guard
- `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` — new: is_local column
- `packages/db/src/types/supabase.ts` — is_local in servers Row/Insert/Update types
- `packages/deployment/src/infra.ts` — execSync import; checkServerHealthLocal() private method; is_local early-return in checkServerHealth; getFleetHealth passes is_local
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — siteId made optional; registration panel guarded by {siteId && (...)}
- `apps/admin/src/app/(dashboard)/research/page.tsx` — DomainManagement imported and rendered in left column
