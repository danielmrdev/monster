---
id: S04
parent: M014
milestone: M014
provides:
  - "Categories tab (renamed from 'Content') with description + product count badge per row, full-row navigation to detail page"
  - "Category detail page at /sites/[id]/categories/[catId] — breadcrumb, header, products table with search + pagination"
  - "Category-scoped products API route GET /api/sites/[id]/categories/[catId]/products — paginated, searchable, same shape as /api/sites/[id]/products"
  - "productsSlot prop fully removed from SiteDetailTabs and call sites"
requires: []
affects:
  - S05
  - S06
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx
  - apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx
key_decisions:
  - "Supabase nested aggregate count via .select('..., category_products(count)') — unwrapped with `as unknown as { count: number }[]` cast; ?? 0 fallback in page.tsx before passing to CategoriesSection"
  - "Full-row Link navigation in CategoriesSection: entire row is a <Link>; Edit/Delete buttons use e.stopPropagation() + onClick e.preventDefault() wrapper to remain independently operable"
  - "Supabase !inner join for category-scoped products: .select('..., category_products!inner(category_id)') + .eq('category_products.category_id', catId) — both in API route and server component initial fetch"
  - "Join metadata stripped before returning: ({ category_products: _cp, ...p }) => p — consistent in both API route and server component"
  - "CategoryProductsSection is read-only: no Add Product link, no DeleteProductButton — only Edit link per row"
  - "Breadcrumb shows 'Site' label (not site UUID/name) to avoid a second Supabase query in the detail page"
patterns_established:
  - "Supabase nested aggregate count pattern: .select('..., relation(count)') → (data as unknown as { count: number }[] | null)?.[0]?.count ?? 0"
  - "Supabase !inner join for scoped sub-resource queries: .select('..., join_table!inner(fk_col)') + .eq('join_table.fk_col', value)"
  - "Strip join metadata pattern: products.map(({ category_products: _cp, ...p }) => p)"
observability_surfaces:
  - "API route: console.error('[API /categories/[catId]/products] Supabase error:', error.message, { siteId, catId }) — structured, grep-able"
  - "Detail page: notFound() on missing/unauthorized category — explicit 404, not silent empty render"
  - "CategoriesSection: product count badge shows 0 products for empty categories or broken relationship — visible degradation, not hidden"
  - "CategoryProductsSection: empty state renders 'No products in this category yet.' — zero is visible"
  - "TypeScript: cd apps/admin && npx tsc --noEmit — authoritative health check for prop/interface mismatches"
drill_down_paths:
  - .gsd/milestones/M014/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M014/slices/S04/tasks/T02-SUMMARY.md
duration: ~37m total (T01: 12m, T02: 25m)
verification_result: passed
completed_at: 2026-03-18
---

# S04: Categories Tab Redesign + Category Detail Page

**Renamed the "Content" tab to "Categories" with description + product count per row; added a full category detail page at `/sites/[id]/categories/[catId]` with per-category product search and pagination.**

## What Happened

Two tasks landed sequentially, each touching a distinct layer:

**T01 — Data layer + tab/section display.**  
Three files changed in concert to keep TypeScript clean: `page.tsx` updated the `tsa_categories` query to include `description` and `category_products(count)`, removed the separate `tsa_products` query entirely, and mapped a `productCount` via `(cat.category_products as unknown as { count: number }[] | null)?.[0]?.count ?? 0`. `SiteDetailTabs.tsx` had `productsSlot` removed from its interface, destructuring, and JSX; the trigger label changed from "Content" to "Categories" with `value="categories"`. `CategoriesSection.tsx` updated its `Category` interface to add `description` and `productCount`, replaced the `seo_text` excerpt display with a description line (with "No description" italic fallback), added a product count badge, and made each row a full-width `<Link>` — Edit/Delete buttons use `e.stopPropagation()` + `e.preventDefault()` to remain independently operable.

**T02 — New API route + category detail page.**  
Three new files created. The API route mirrors the existing `/api/sites/[id]/products` route — same query params (`q`, `page`, `limit`), same JSON response shape — with the only addition being the `category_products!inner` join + `.eq('category_products.category_id', catId)` scoping. `CategoryProductsSection.tsx` was adapted from `ProductsSection.tsx` with the same debounce/pagination/loading state pattern; it's read-only (no Add Product, no Delete). The server component `page.tsx` fetches the category with `notFound()` guard, performs the same `!inner` join for the initial products load, strips join metadata, and renders a breadcrumb + header (name, slug, description, Edit button) + `CategoryProductsSection`.

## Verification

All slice-level checks passed:

```
cd apps/admin && npx tsc --noEmit                             → EXIT 0
grep 'Categories' SiteDetailTabs.tsx                          → TabsTrigger + TabsContent (PASS)
grep -r 'productsSlot' sites/[id]/                            → no matches (PASS)
test -f .../categories/[catId]/page.tsx                       → PASS
test -f .../categories/[catId]/products/route.ts              → PASS
grep 'console.error.*catId' route.ts                          → structured log present (PASS)
productCount ?? 0 fallback in page.tsx                        → present (PASS)
```

The `productCount.*0` grep in `CategoriesSection.tsx` returns a WARN because the `?? 0` fallback lives in `page.tsx` (where `productCount` is computed) rather than in the section component that consumes it — which is the correct architecture. The zero-guard is present and effective.

## Requirements Advanced

- None tracked for this slice specifically — S04 is pure UX improvement to the site detail view.

## Requirements Validated

- None newly validated — this slice delivers UI reorganization, not a new capability that maps to a tracked requirement.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- The slice plan's verification grep for `productCount.*0` targeted `CategoriesSection.tsx`, but the `?? 0` fallback is correctly placed in `page.tsx` (the data mapper). The check produces a WARN on `CategoriesSection.tsx` but the guard is present and works.
- T02 added a slug display line (`font-mono text-sm text-muted-foreground`) in the category detail page header — minor UX improvement not in the plan, zero risk.
- T02 updated `S04-PLAN.md` and `T02-PLAN.md` with additional observability sections during execution — documentation improvement, not a behavioral deviation.

## Known Limitations

- Breadcrumb on the category detail page shows "Site" as a static label rather than the actual site name — avoids a second Supabase round-trip. Acceptable for now; a future slice could pass the name via URL state or a lightweight fetch.
- `CategoryProductsSection` is read-only. There is no way to add or remove products from a category from the detail page — only Edit links point to the main product edit form. Category-product association management is out of scope for M014.

## Follow-ups

- None discovered during execution beyond what the roadmap already captures.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — removed ProductsSection import and products fetch; updated categories query with description + category_products(count); mapped productCount with ?? 0 fallback; removed productsSlot prop
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — removed productsSlot from interface/destructuring/JSX; renamed tab to "Categories" with value="categories"
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — updated Category interface; rows show description + productCount badge; rows are full-row Links to category detail page
- `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` — new: GET handler, paginated + searchable products scoped via category_products!inner join, strips join metadata, structured error logging
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` — new: client component with search + pagination + loading state, read-only, Edit link per row
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — new: server component, notFound() guard, !inner join initial fetch, breadcrumb + header + CategoryProductsSection

## Forward Intelligence

### What the next slice should know
- `productsSlot` is gone from `SiteDetailTabs` — do not reference it. The tab structure is now: Overview, Deploy, Categories, SEO Scores, Alerts.
- The `category_products(count)` nested aggregate pattern is established in `page.tsx` and tested. Use it as the reference for any future nested-count queries.
- The `!inner` join pattern for category-scoped queries is in `route.ts` — it's the clean way to scope products to a category without a subquery.

### What's fragile
- Supabase `category_products` relationship: the `!inner` join relies on the FK relationship being correctly defined in Supabase. If the relationship is misconfigured or renamed, both the API route and the server component initial fetch will silently return no products (the `!inner` join filters to intersection — empty intersection = empty result, not an error). A Supabase schema change here could break the category detail page without a TypeScript error.
- The `as unknown as { count: number }[]` cast for nested aggregate counts is load-bearing — TypeScript cannot verify this at compile time. If Supabase changes the aggregate return shape, this silently returns `undefined` and the `?? 0` fallback kicks in, showing 0 everywhere.

### Authoritative diagnostics
- `cd apps/admin && npx tsc --noEmit` — catches prop/interface regressions immediately; treat non-zero as a blocker.
- `grep -r 'productsSlot' apps/admin/src/app/(dashboard)/sites/[id]/` — regression check; any match is a FAIL.
- Product count badge on the Categories tab: shows `0 products` for all categories indicates the `category_products(count)` relationship is broken or the query changed.

### What assumptions changed
- Original plan assumed the zero fallback would live in `CategoriesSection.tsx`. Executor correctly placed it in `page.tsx` during the data mapping step — this is the right architecture (data layer handles defaults, UI layer renders what it receives).
