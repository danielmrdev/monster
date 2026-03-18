# S04: Categories Tab Redesign + Category Detail Page

**Goal:** Rename the "Content" tab to "Categories", update category rows to show description + product count, make rows link to a new per-category detail page, and create that detail page with products + search.
**Demo:** Navigate to `/sites/[id]` → Categories tab → rows show description + product count badge. Click a row → navigates to `/sites/[id]/categories/[catId]` → page shows that category's products with a search box.

## Must-Haves

- "Content" tab renamed to "Categories" in `SiteDetailTabs.tsx`; `productsSlot` prop removed from interface and call site
- Categories rows show `description` and product count (not `seo_text` excerpt); each row links to `/sites/[id]/categories/[catId]`
- Categories query includes `description` and nested product count via `category_products(count)`
- New page at `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` with products list + search
- New API route at `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` returning paginated, searchable products scoped to that category

## Verification

```bash
# TypeScript — zero errors
cd apps/admin && npx tsc --noEmit

# Tab rename — "Categories" present, "Content" absent (as a tab label)
grep -r '"Categories"' apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx
grep -r 'productsSlot' apps/admin/src/app/\(dashboard\)/sites/\[id\]/ && echo "FAIL: productsSlot still present" || echo "PASS: productsSlot removed"

# New files exist
test -f apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/page.tsx && echo "PASS" || echo "FAIL: detail page missing"
test -f apps/admin/src/app/api/sites/\[id\]/categories/\[catId\]/products/route.ts && echo "PASS" || echo "FAIL: API route missing"
```

## Tasks

- [ ] **T01: Update categories query, tab label, and section display** `est:45m`
  - Why: The data layer and the tab/section changes must be consistent — removing `productsSlot` from the tab component, updating the interface, and changing what the section displays all need to land together to keep TypeScript clean.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx`
  - Do: see T01-PLAN.md
  - Verify: `cd apps/admin && npx tsc --noEmit` exits 0; tab label is "Categories"; rows show description + count
  - Done when: TypeScript clean; `productsSlot` prop does not appear anywhere in the three modified files; CategoriesSection rows link to `/sites/[id]/categories/[catId]`

- [ ] **T02: Create category-scoped products API route + category detail page** `est:1h`
  - Why: T01 establishes the navigation target URL; T02 implements the destination page and its data source.
  - Files: `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` (new), `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` (new), `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` (new)
  - Do: see T02-PLAN.md
  - Verify: `cd apps/admin && npx tsc --noEmit` exits 0; both new files exist
  - Done when: TypeScript clean; API route exists and mirrors shape of existing products route filtered by `category_id`; detail page server component renders category name + `CategoryProductsSection`

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx`
- `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` (new)
