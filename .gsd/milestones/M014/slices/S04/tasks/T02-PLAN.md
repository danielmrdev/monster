---
estimated_steps: 8
estimated_files: 3
---

# T02: Create category-scoped products API route + category detail page

**Slice:** S04 — Categories Tab Redesign + Category Detail Page
**Milestone:** M014

## Description

T01 established the navigation target `/sites/[id]/categories/[catId]`. This task creates:

1. A new API route `GET /api/sites/[id]/categories/[catId]/products` — paginated + searchable products scoped to a single category via the `category_products` join table. Mirrors the shape of the existing `/api/sites/[id]/products` route exactly.
2. A new server component `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` that fetches the category name + initial products, then renders a `CategoryProductsSection` client component.
3. `CategoryProductsSection.tsx` — a client component that replicates `ProductsSection`'s search + pagination pattern but targets the new category-scoped API route. Does not include "Add Product" or "Delete" actions — this is a read-only view within the category detail context.

Note: `[catId]/edit/page.tsx` already exists at this path level. Next.js App Router supports both `[catId]/page.tsx` and `[catId]/edit/page.tsx` without conflict — they are different route segments.

## Steps

1. **Create the API route** at `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts`:
   - Route params: `{ id: siteId, catId: categoryId }`
   - Accept same query params as existing products route: `q`, `page`, `limit`
   - Products query: join via `category_products` — use Supabase's `!inner` join pattern:
     ```ts
     supabase
       .from('tsa_products')
       .select(
         'id, asin, title, current_price, rating, review_count, is_prime, source_image_url, images, category_products!inner(category_id)',
         { count: 'exact' }
       )
       .eq('site_id', siteId)
       .eq('category_products.category_id', catId)
       .order('created_at', { ascending: false })
       .range(from, to)
     ```
   - Apply `q` search filter as in the existing route: `.or(\`title.ilike.%${q}%,asin.ilike.%${q}%\`)`
   - Return same JSON shape: `{ products, total, page, pageSize, totalPages }`
   - Strip `category_products` from the returned product objects (it's internal join metadata — don't leak it). Map the `data` array: `data.map(({ category_products: _cp, ...p }) => p)`.
   - Error handling: return `{ error: error.message }` with status 500 on query error.
   - Params type follows Next.js 15 pattern with `Promise<{ id: string; catId: string }>`.

2. **Create `CategoryProductsSection.tsx`** at `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx`:
   - `'use client'` component — identical structure to `ProductsSection.tsx` but:
     - Props: `{ siteId: string; catId: string; initialProducts: Product[]; initialTotal: number }`
     - API URL: `` `/api/sites/${siteId}/categories/${catId}/products` ``
     - No "Add Product" link in the header
     - No `DeleteProductButton` per row — rows show product info + an "Edit" link pointing to `/sites/${siteId}/products/${product.id}/edit`
     - Header title: `"Products in this category"` (or simply `"Products"`) with the total count
   - Reuse all the same Product interface, StarRating helper, debounce pattern, fetchProducts, pagination UI — copy and adapt from `ProductsSection.tsx`.

3. **Create the category detail page** at `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx`:
   - Server component with `export const dynamic = 'force-dynamic'`
   - Params: `Promise<{ id: string; catId: string }>`
   - Fetch category: `supabase.from('tsa_categories').select('id, name, slug, description').eq('id', catId).eq('site_id', siteId).single()` — call `notFound()` if missing
   - Fetch initial products via Supabase directly (not via HTTP — same query as the API route, without `!inner` join metadata, just `.range(0, 24)`)
   - Render layout:
     ```tsx
     <div className="max-w-3xl mx-auto space-y-6">
       {/* Breadcrumb */}
       <div className="flex items-center gap-2 text-sm text-muted-foreground">
         <Link href="/sites">Sites</Link>
         <span>/</span>
         <Link href={`/sites/${siteId}`}>{siteId}</Link>
         <span>/</span>
         <span className="text-foreground">{category.name}</span>
       </div>
       {/* Header */}
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold tracking-tight">{category.name}</h1>
           {category.description && (
             <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
           )}
         </div>
         <Link href={`/sites/${siteId}/categories/${catId}/edit`} ...>Edit Category</Link>
       </div>
       {/* Products */}
       <CategoryProductsSection
         siteId={siteId}
         catId={catId}
         initialProducts={initialProducts}
         initialTotal={initialTotal}
       />
     </div>
     ```
   - The breadcrumb uses `siteId` (the UUID/slug) as a label — that's fine for now, it links back to the site detail. Future improvement: fetch site name. Do not add a second supabase query just for the site name.

4. **Initial products query in `page.tsx` (server-side):** Fetch products for the initial render using the same join pattern as the API route:
   ```ts
   const productsResult = await supabase
     .from('tsa_products')
     .select(
       'id, asin, title, current_price, rating, review_count, is_prime, source_image_url, images',
       { count: 'exact' }
     )
     .eq('site_id', siteId)
     .in(
       'id',
       await supabase
         .from('category_products')
         .select('product_id')
         .eq('category_id', catId)
         .then(r => (r.data ?? []).map(x => x.product_id))
     )
     .order('created_at', { ascending: false })
     .range(0, 24)
   ```
   Alternatively, use a simpler approach: fetch all product IDs for the category first, then query products. If the category has zero products, skip the product fetch and pass `[]` and `0` to the component. Handle the case where `catId` has no products gracefully (empty initial state is valid).

   **Simpler approach (preferred):** Do the category_products join directly in the server component using the same `!inner` technique as the API route, then strip the join metadata before passing to the client component.

5. **TypeScript check:** Run `cd apps/admin && npx tsc --noEmit`. Fix any errors.

6. **File existence check:** Confirm both new files exist and the API route is reachable:
   ```bash
   test -f apps/admin/src/app/api/sites/\[id\]/categories/\[catId\]/products/route.ts && echo "API route: PASS"
   test -f apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/page.tsx && echo "Detail page: PASS"
   test -f apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/CategoryProductsSection.tsx && echo "Client component: PASS"
   ```

## Must-Haves

- [ ] API route returns same JSON shape as existing `/api/sites/[id]/products` route, scoped to `catId` via `category_products` join
- [ ] API route strips `category_products` join metadata from returned product objects
- [ ] `CategoryProductsSection.tsx` is `'use client'`, accepts `{ siteId, catId, initialProducts, initialTotal }`, hits the new API route
- [ ] Category detail page fetches category (404 if not found), fetches initial products, renders breadcrumb + header + `CategoryProductsSection`
- [ ] TypeScript: `cd apps/admin && npx tsc --noEmit` exits 0
- [ ] All three new files exist on disk

## Verification

```bash
# TypeScript clean
cd apps/admin && npx tsc --noEmit

# All three new files exist
test -f apps/admin/src/app/api/sites/\[id\]/categories/\[catId\]/products/route.ts && echo "API: PASS" || echo "API: FAIL"
test -f apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/page.tsx && echo "Page: PASS" || echo "Page: FAIL"
test -f apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/CategoryProductsSection.tsx && echo "Section: PASS" || echo "Section: FAIL"

# API route has catId param extraction
grep 'catId' apps/admin/src/app/api/sites/\[id\]/categories/\[catId\]/products/route.ts

# Client component targets category-scoped URL
grep 'categories/\${catId}/products' apps/admin/src/app/\(dashboard\)/sites/\[id\]/categories/\[catId\]/CategoryProductsSection.tsx
```

## Inputs

- `apps/admin/src/app/api/sites/[id]/products/route.ts` — existing products API to mirror (same shape, same params, add catId scoping)
- `apps/admin/src/app/(dashboard)/sites/[id]/ProductsSection.tsx` — existing client component to replicate pattern from
- T01 output: category rows now link to `/sites/[id]/categories/[catId]` — this task implements the destination

## Expected Output

- `apps/admin/src/app/api/sites/[id]/categories/[catId]/products/route.ts` (new) — paginated searchable products for a single category
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` (new) — client component with search + pagination, no delete action
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` (new) — server component: breadcrumb, category header, `CategoryProductsSection`
