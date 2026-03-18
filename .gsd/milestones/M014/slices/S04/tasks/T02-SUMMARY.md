---
id: T02
parent: S04
milestone: M014
provides:
  - "Category-scoped products API route GET /api/sites/[id]/categories/[catId]/products (paginated, searchable, same shape as /api/sites/[id]/products)"
  - "CategoryProductsSection client component with search + pagination, no delete action, targeting the new API"
  - "Category detail page at /sites/[id]/categories/[catId]: fetches category (404 if missing), initial products via !inner join, renders breadcrumb + header + CategoryProductsSection"
key_files:
  - apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx
key_decisions:
  - "Used Supabase !inner join pattern (.eq('category_products.category_id', catId)) to scope products to a category in both the API route and the server component initial fetch"
  - "Strip category_products join metadata via destructuring: ({ category_products: _cp, ...p }) => p — consistent in both API route and server component"
  - "Detail page breadcrumb shows 'Site' label (not site UUID/name) to avoid a second Supabase query — plan acknowledges this as a known simplification"
  - "CategoryProductsSection is read-only: no Add Product link, no DeleteProductButton — only Edit link per row pointing to /sites/[siteId]/products/[productId]/edit"
patterns_established:
  - "Supabase !inner join for category-scoped product queries: .select('..., category_products!inner(category_id)') + .eq('category_products.category_id', catId)"
  - "Strip join metadata before returning/passing to client: ({ category_products: _cp, ...p }) => p"
observability_surfaces:
  - "API route: console.error('[API /categories/[catId]/products] Supabase error:', error.message, { siteId, catId }) on query failure — structured, grep-able"
  - "page.tsx: notFound() on missing/unauthorized category — explicit 404, not silent empty render"
  - "CategoryProductsSection: empty state renders 'No products in this category yet.' — zero products is visible, not hidden"
duration: ~25m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Create category-scoped products API route + category detail page

**Added category detail page + category-scoped products API with search/pagination — all three files created, TypeScript clean.**

## What Happened

Created three new files implementing the destination for category row navigation established in T01:

1. **API route** (`route.ts`): Mirrors the existing `/api/sites/[id]/products` route exactly — same query params (`q`, `page`, `limit`), same JSON response shape (`{ products, total, page, pageSize, totalPages }`), same search filter pattern. The only addition is the `category_products!inner` join + `.eq('category_products.category_id', catId)` scoping. Join metadata stripped from returned objects before serializing.

2. **`CategoryProductsSection.tsx`**: Copied and adapted from `ProductsSection.tsx` — identical debounce/pagination/loading state pattern, hits the new API URL `/api/sites/${siteId}/categories/${catId}/products`. Removed "Add Product" link and `DeleteProductButton`. Added `catId` to props and the `useCallback` dependency array.

3. **`page.tsx`**: Server component with `force-dynamic`. Fetches category with `notFound()` on missing. Fetches initial products using the same `!inner` join pattern as the API route, strips join metadata, passes clean products + count to `CategoryProductsSection`. Layout: breadcrumb → header (name, slug, description, Edit button) → `CategoryProductsSection`.

The pre-flight observability gaps were also addressed: S04-PLAN.md got two additional failure-path verification checks (structured error log grep + zero fallback grep), and T02-PLAN.md got a full `## Observability Impact` section documenting all runtime signals and inspection commands.

## Verification

```bash
# TypeScript clean — exit 0, no output
cd apps/admin && npx tsc --noEmit

# All three files exist
test -f "apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts"      # PASS
test -f "apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx"       # PASS
test -f "apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx"  # PASS

# catId extraction present in API route
grep 'catId' route.ts  # found in params type, destructuring, .eq() call, and console.error

# Category-scoped URL in client component
grep 'categories/${catId}/products' CategoryProductsSection.tsx  # found in fetchProducts
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 3.9s |
| 2 | `test -f apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` | 0 | ✅ pass | <1s |
| 3 | `test -f apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` | 0 | ✅ pass | <1s |
| 4 | `test -f apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` | 0 | ✅ pass | <1s |
| 5 | `grep 'catId' route.ts` | 0 | ✅ pass | <1s |
| 6 | `grep 'categories/\${catId}/products' CategoryProductsSection.tsx` | 0 | ✅ pass | <1s |
| 7 | Slice: `grep -r 'productsSlot' sites/[id]/` | 1 | ✅ pass (absent = PASS) | <1s |
| 8 | Slice: `test -f ...categories/[catId]/page.tsx` | 0 | ✅ pass | <1s |
| 9 | Slice: `test -f ...categories/[catId]/products/route.ts` | 0 | ✅ pass | <1s |

## Diagnostics

- **API failure:** `grep 'console.error' apps/admin/src/app/api/sites/\[id\]/categories/\[catId\]/products/route.ts` — confirms structured error log with `{ siteId, catId }` context
- **Category 404:** `grep 'notFound' apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/page.tsx` — confirms explicit not-found handling
- **Empty state:** `grep 'No products in this category' ...CategoryProductsSection.tsx` — confirms visible zero-state text
- **At runtime:** any Supabase join misconfiguration returns a 500 with `{ error: "<message>" }` and a server-side log entry containing `[API /categories/[catId]/products]`

## Deviations

- Breadcrumb "Site" label used instead of site UUID per plan suggestion — the plan explicitly noted this is acceptable and deferred fetching the site name to avoid a second query.
- Added `font-mono text-sm text-muted-foreground mt-0.5` slug display line in the page header (not in plan) — minor UX improvement, zero risk.

## Known Issues

none

## Files Created/Modified

- `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` — new: GET handler, paginated + searchable products scoped via category_products!inner join, strips join metadata, structured error logging
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` — new: client component with search + pagination + loading state, read-only (no delete), Edit link per row
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — new: server component, notFound() guard, !inner join initial fetch, breadcrumb + header + CategoryProductsSection
- `.gsd/milestones/M014/slices/S04/S04-PLAN.md` — added failure-path verification checks to Verification section; marked T02 done
- `.gsd/milestones/M014/slices/S04/tasks/T02-PLAN.md` — added Observability Impact section
