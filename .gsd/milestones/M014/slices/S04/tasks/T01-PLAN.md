---
estimated_steps: 7
estimated_files: 3
---

# T01: Update categories query, tab label, and section display

**Slice:** S04 — Categories Tab Redesign + Category Detail Page
**Milestone:** M014

## Description

Three coordinated changes that must land together to keep TypeScript clean:

1. The categories query in `page.tsx` needs `description` and a nested product count via `category_products(count)`.
2. `CategoriesSection.tsx` needs to display `description` + product count badge, and make each category row a link to the detail page instead of only having an "Edit" action.
3. `SiteDetailTabs.tsx` needs the "Content" tab renamed to "Categories", the `productsSlot` prop removed from the interface and the JSX, and the `TabsTrigger value` updated to match.

These three changes touch the same data flow (category list → display) and removing `productsSlot` requires updating both the interface in `SiteDetailTabs.tsx` and its call site in `page.tsx` simultaneously. Splitting this across tasks would leave the code in a broken TypeScript state between tasks.

## Steps

1. **Update the categories query in `page.tsx`:** Change the `tsa_categories` select to:
   ```ts
   supabase
     .from('tsa_categories')
     .select('id, name, slug, focus_keyword, keywords, seo_text, description, category_products(count)')
     .eq('site_id', id)
     .order('name', { ascending: true })
   ```
   The nested `category_products(count)` returns `[{ count: number }]` per row — Supabase JS supports this. Access the count as `cat.category_products?.[0]?.count ?? 0`.

2. **Remove the products-related data fetch from `page.tsx`:** Remove the `productsResult` from the `Promise.all` array (the `tsa_products` query with pagination). Remove the `products` and `productsTotal` variables that depend on it. Remove the `ProductsSection` import.

3. **Remove `productsSlot` from `SiteDetailTabs.tsx`:** In the `TabsProps` interface, delete the `productsSlot: React.ReactNode` field. In the function signature destructuring, remove `productsSlot`. In the JSX, change the "Content" `TabsContent` to only render `{categoriesSlot}` — remove `{productsSlot}`. Rename `TabsTrigger value="content"` to `value="categories"` and the label to `"Categories"`. Rename `TabsContent value="content"` to `value="categories"`.

4. **Remove `productsSlot` from the call site in `page.tsx`:** Delete the `productsSlot={...}` prop from the `<SiteDetailTabs>` JSX. This keeps TypeScript happy since the prop no longer exists in the interface.

5. **Update `CategoriesSection.tsx`:** 
   - Update the `Category` interface to add `description: string | null` and `productCount: number` (the caller will pass the unwrapped count).
   - Replace the `seo_text` excerpt paragraph and the keywords paragraph with a single line showing `description` (truncated, `line-clamp-1`) or a muted fallback if null.
   - Add a product count badge next to the category name — use a `<span>` like `<span className="text-xs text-muted-foreground bg-muted/40 rounded-full px-2 py-0.5">{productCount} products</span>`.
   - Make the entire row (the outer `<div>` wrapping the row content) link to `/sites/${siteId}/categories/${cat.id}` using Next.js `<Link>`. The row should be navigable by clicking anywhere on it, not just the "Edit" button. Keep the "Edit" link and Delete button as inline actions on the right — they still work independently.

6. **Wire the updated query result to `CategoriesSection` in `page.tsx`:** When building the `categories` array from `categoriesResult.data`, unwrap the product count:
   ```ts
   const categories = (categoriesResult.data ?? []).map((cat) => ({
     ...cat,
     productCount: (cat.category_products as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
   }))
   ```
   Pass these to `<CategoriesSection>`. The Supabase auto-typed client may not have a precise type for the nested count; use `as unknown as { count: number }[]` to unwrap it cleanly.

7. **TypeScript check:** Run `cd apps/admin && npx tsc --noEmit`. Fix any type errors before marking done.

## Must-Haves

- [ ] Tab label is "Categories" (not "Content"); `TabsTrigger` and `TabsContent` values updated to `"categories"`
- [ ] `productsSlot` removed from `TabsProps` interface, function destructuring, JSX, and call site in `page.tsx`
- [ ] `ProductsSection` import removed from `page.tsx`; products data fetch removed from `Promise.all`
- [ ] Category rows in `CategoriesSection` show `description` (or fallback) and a product count badge
- [ ] Each category row links to `/sites/[id]/categories/[catId]` (clicking the row navigates)
- [ ] TypeScript: `cd apps/admin && npx tsc --noEmit` exits 0

## Verification

```bash
# Zero TypeScript errors
cd apps/admin && npx tsc --noEmit

# Tab rename applied
grep '"Categories"' apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx

# productsSlot fully gone
grep -r 'productsSlot' apps/admin/src/app/\(dashboard\)/sites/\[id\]/ && echo "FAIL" || echo "PASS"

# ProductsSection import gone from page.tsx
grep 'ProductsSection' apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx && echo "FAIL" || echo "PASS"

# Detail link present in CategoriesSection
grep 'categories/\${cat.id}' apps/admin/src/app/\(dashboard\)/sites/\[id\]/CategoriesSection.tsx
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — existing server component with categories + products fetch; remove products fetch, update categories query
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — has `productsSlot` prop and "Content" tab label; both need updating
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — currently shows `seo_text` excerpt and keywords; update to description + count

## Expected Output

- `page.tsx` — categories query includes `description` + `category_products(count)`; `productsResult` removed; `ProductsSection` import removed; `productsSlot` prop call removed; categories mapped with unwrapped `productCount`
- `SiteDetailTabs.tsx` — `productsSlot` removed from interface/destructuring/JSX; tab renamed "Categories" with value `"categories"`
- `CategoriesSection.tsx` — `Category` interface has `description` + `productCount`; rows show description + count badge; rows link to detail page
