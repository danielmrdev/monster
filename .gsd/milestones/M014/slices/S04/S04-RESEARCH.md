# S04 — Research: Categories Tab Redesign + Category Detail Page

**Date:** 2026-03-18

## Summary

This slice is straightforward CRUD + UI work using established patterns already in the codebase. The DB schema already has `description` on `tsa_categories`, and the `category_products` join table already links categories to products. Nothing new to integrate — just:

1. Update the categories query in `page.tsx` to include `description` and a product count aggregate
2. Update `CategoriesSection.tsx` to show description + product count, and make rows link to the detail page
3. Rename the "Content" tab to "Categories" in `SiteDetailTabs.tsx` and remove `productsSlot`
4. Create `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` as the category detail page with products + search

## Recommendation

Two tasks: (T01) DB query + tab rename + CategoriesSection update; (T02) new category detail page. They're sequential because T02 needs to know the final URL shape confirmed in T01.

## Implementation Landscape

### Key Files

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — server component that fetches data and wires slots. Currently fetches categories without `description` and without product count. Needs: add `description` to select, add product count via `category_products` aggregate.
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — currently shows `seo_text` excerpt and keywords. Needs: show `description` + product count badge; make each row a link to `/sites/[id]/categories/[catId]` (view, not edit).
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — "Content" tab renders `{categoriesSlot}{productsSlot}`. Needs: rename tab to "Categories", remove `productsSlot` prop, render only `{categoriesSlot}`.
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — **does not exist**. `[catId]/edit/page.tsx` exists. New file needed at this path.
- `apps/admin/src/app/api/sites/[id]/products/route.ts` — existing products API (paginated, searchable). The category detail page needs a scoped version: products for a specific category via `category_products` join.

### Data Model

`category_products` join table:
```
category_id uuid → tsa_categories.id
product_id  uuid → tsa_products.id
position    int
```

Product count per category: use Supabase's embedded count via `tsa_products(count)` through the junction, or a direct count query on `category_products`.

Two viable options for the product count in the categories list:
1. **Supabase nested count** — `tsa_categories.select('..., category_products(count)')` — Supabase supports this syntax; returns `[{count: N}]` per row which requires unwrapping.
2. **Separate count query** — `supabase.from('category_products').select('category_id, count:product_id', { count: 'exact' }).eq(...)` grouped — but Supabase JS doesn't support GROUP BY natively.

The cleanest approach: use the Supabase JS nested select `category_products(count)` — returns an array with one element `{count: N}`. Access as `cat.category_products?.[0]?.count ?? 0`.

For the category detail page products query: fetch via join `category_products!inner` filtered by `category_id`, or fetch products with an IN clause of product IDs. The cleanest Supabase approach:
```ts
supabase.from('tsa_products')
  .select('..., category_products!inner(category_id)')
  .eq('category_products.category_id', catId)
```
Or equivalently, join from category side. The `ProductsSection` client component already handles search + pagination via `/api/sites/[id]/products`, but that endpoint doesn't filter by category. The category detail page will need either a new API route or server-rendered initial load with category scoping. Given the category detail page can be a server component with a client search sub-component, the simplest path is to create a new API route `/api/sites/[id]/categories/[catId]/products` mirroring the existing products route but filtered through `category_products`.

Alternatively, keep the detail page purely server-rendered (no client search), like the existing edit pages. Given the roadmap says "products + search", a client component is needed for search. The `ProductsSection` pattern (client component + API route) is the right model to replicate.

### Build Order

1. **T01:** Update categories query in `page.tsx` (add `description` + nested `category_products(count)`), update `CategoriesSection.tsx` (show description + count, link rows to detail), rename "Content" → "Categories" tab in `SiteDetailTabs.tsx`, remove `productsSlot` prop.
2. **T02:** Create new API route `/api/sites/[id]/categories/[catId]/products` (category-scoped products, same shape as existing products route), create category detail page `sites/[id]/categories/[catId]/page.tsx` (server component + client `CategoryProductsSection` component reusing the `ProductsSection` pattern).

### Verification Approach

```bash
# TypeScript check
cd apps/admin && npx tsc --noEmit

# Visual check: navigate to /sites/[id] → Categories tab → rows show description + count
# Click a category row → navigates to /sites/[id]/categories/[catId]
# Category detail shows product list with search + pagination
```

## Constraints

- `productsSlot` is currently passed from `page.tsx` into `SiteDetailTabs`; removing it requires updating both the prop interface and the call site in `page.tsx`. The `ProductsSection` import and data fetch in `page.tsx` can be removed entirely.
- Supabase nested count syntax `category_products(count)` returns `[{count: number}]` not a plain number — unwrap with `cat.category_products?.[0]?.count ?? 0`.
- The new category detail page lives at `[catId]/page.tsx`, but `[catId]/edit/page.tsx` already exists. Next.js App Router handles both — no conflict.
- `TabsList` currently has `grid-cols-4` — with "Categories" replacing "Content", the label changes but the count stays 4, so no grid change needed.

## Common Pitfalls

- **TypeScript: `category_products` type** — Supabase auto-typed client may not have the nested count type; cast explicitly or use `unknown` intermediary when unwrapping the count.
- **Removing `productsSlot`** — the prop is destructured in `SiteDetailTabs`; TypeScript will catch missing props if only one side is updated. Update both the interface and the JSX simultaneously.
