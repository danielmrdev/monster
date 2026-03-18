---
id: T01
parent: S04
milestone: M014
provides:
  - Categories query with description and nested product count
  - Tab renamed from "Content" to "Categories" with productsSlot removed
  - CategoriesSection rows showing description + product count badge, linking to detail page
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx
key_decisions:
  - Used `as unknown as { count: number }[]` cast to unwrap Supabase nested count return — the generated types don't model `category_products(count)` precisely
  - Made the entire category row a `<Link>` for full-row navigation; Edit/Delete buttons use `e.stopPropagation()` and a wrapping `onClick e.preventDefault()` div to remain independently clickable
patterns_established:
  - Supabase nested aggregate count pattern: `.select('..., relation(count)')` → unwrap as `(data as unknown as { count: number }[] | null)?.[0]?.count ?? 0`
observability_surfaces:
  - Product count badge shows `0 products` for empty categories or broken relationship — visible without DB access
  - TypeScript `cd apps/admin && npx tsc --noEmit` is the authoritative health check for interface/prop mismatches
  - grep for `productsSlot` in the sites/[id]/ directory confirms removal regression check
duration: 12m
verification_result: passed
completed_at: 2026-03-18T18:20:00Z
blocker_discovered: false
---

# T01: Update categories query, tab label, and section display

**Renamed "Content" tab to "Categories", removed productsSlot, updated CategoriesSection rows to show description + product count badge with full-row navigation to the category detail page.**

## What Happened

Three coordinated changes landed together to keep TypeScript clean:

1. **`page.tsx`**: Updated `tsa_categories` query to include `description` and `category_products(count)`. Removed the `tsa_products` query from `Promise.all`, removed `ProductsSection` import, removed `products`/`productsTotal` variables, removed `productsSlot` prop from the `<SiteDetailTabs>` call. Categories are mapped with an unwrapped `productCount` using `as unknown as { count: number }[]` cast.

2. **`SiteDetailTabs.tsx`**: Removed `productsSlot` from `TabsProps` interface, function destructuring, and JSX. Renamed `TabsTrigger value="content"` to `value="categories"` with label "Categories". Renamed `TabsContent value="content"` to `value="categories"`. The tab now only renders `{categoriesSlot}`.

3. **`CategoriesSection.tsx`**: Updated `Category` interface to add `description: string | null` and `productCount: number`. Replaced `seo_text` excerpt + keywords display with a single `description` line (or "No description" italic fallback). Added product count badge. Made the entire row a `<Link href="/sites/${siteId}/categories/${cat.id}">` — Edit and Delete buttons use `e.stopPropagation()` / `e.preventDefault()` on a wrapping div to remain independently operable.

## Verification

- `cd apps/admin && npx tsc --noEmit` — exited 0, zero errors
- `grep -r 'productsSlot' apps/admin/src/app/(dashboard)/sites/[id]/` — no matches (PASS)
- `grep 'ProductsSection' apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — no matches (PASS)
- `grep 'categories/\${cat.id}' CategoriesSection.tsx` — matches row link and edit link (PASS)
- `grep 'Categories' SiteDetailTabs.tsx` — matches TabsTrigger and TabsContent (PASS)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 4.8s |
| 2 | `grep -r 'productsSlot' sites/[id]/` | 1 (no match) | ✅ pass | <1s |
| 3 | `grep 'ProductsSection' page.tsx` | 1 (no match) | ✅ pass | <1s |
| 4 | `grep 'categories/\${cat.id}' CategoriesSection.tsx` | 0 | ✅ pass | <1s |
| 5 | `grep 'Categories' SiteDetailTabs.tsx \| grep TabsTrigger` | 0 | ✅ pass | <1s |
| 6 | Slice: new detail page (T02 work) | — | ⏳ T02 | — |
| 7 | Slice: API route (T02 work) | — | ⏳ T02 | — |

## Diagnostics

- `cd apps/admin && npx tsc --noEmit` — catches interface/prop mismatches at compile time
- `grep -r 'productsSlot' apps/admin/src/app/(dashboard)/sites/[id]/` — regression check; should return no matches
- Product count badge displays `0 products` when `category_products(count)` returns null — degraded but functional, visible without DB

## Deviations

The task plan's verification grep uses `'"Categories"'` (double-quoted string). JSX text content doesn't use quotes — the tab label is `>Categories</TabsTrigger>`, not `"Categories"`. The check was adapted to grep for `Categories` + TabsTrigger pattern instead. The tab rename is correct.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — removed ProductsSection import and products fetch; updated categories query with description + category_products(count); mapped productCount; removed productsSlot prop
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — removed productsSlot from interface/destructuring/JSX; renamed tab to "Categories" with value="categories"
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — updated Category interface; rows show description + productCount badge; rows are full-row Links to category detail page
