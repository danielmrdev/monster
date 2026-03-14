---
estimated_steps: 4
estimated_files: 2
---

# T03: Add SEO scores table to admin panel site detail page

**Slice:** S04 — SEO Scorer
**Milestone:** M003

## Description

Add a server-side SEO scores table to the site detail page. No client component needed — scores are static post-build and a simple server-side fetch is sufficient. Follows the exact same patterns as `sites/page.tsx` (Table + Badge imports, Supabase service client query).

Depends on T02 (unique constraint migration applied so the table exists with correct shape).

## Steps

1. **Add `@monster/seo-scorer` to `apps/admin/package.json`** — add `"@monster/seo-scorer": "workspace:*"` to dependencies; run `pnpm install`. This gives the admin access to the `SeoScore` type. (If the type is simple enough to inline, this dep can be skipped — but the workspace dep is cleaner for future reuse.)

2. **Query `seo_scores` in `SiteDetailPage`** — after the existing `sites` query, add:
   ```ts
   const { data: seoScores } = await supabase
     .from('seo_scores')
     .select('page_path, page_type, overall_score, grade, content_quality_score, meta_elements_score, structure_score, links_score, media_score, schema_score, technical_score, social_score')
     .eq('site_id', id)
     .order('page_path', { ascending: true })
   ```
   No `notFound()` on error — scores are optional (site might not have been generated yet).

3. **Add imports** — add `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Badge` imports (already available in `apps/admin` from shadcn, same as `sites/page.tsx`).

4. **Render SEO Scores section** — add after the "Site Generation" card:
   ```tsx
   {/* SEO Scores */}
   <div className="rounded-lg border border-gray-200 bg-white shadow-sm px-6 py-4">
     <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
       SEO Scores
     </h2>
     {!seoScores || seoScores.length === 0 ? (
       <p className="text-sm text-gray-500">No SEO scores yet — generate the site first.</p>
     ) : (
       <Table>
         <TableHeader>
           <TableRow>
             <TableHead>Page</TableHead>
             <TableHead>Type</TableHead>
             <TableHead>Score</TableHead>
             <TableHead>Grade</TableHead>
             <TableHead className="text-xs">Content</TableHead>
             <TableHead className="text-xs">Meta</TableHead>
             <TableHead className="text-xs">Structure</TableHead>
             <TableHead className="text-xs">Links</TableHead>
             <TableHead className="text-xs">Media</TableHead>
             <TableHead className="text-xs">Schema</TableHead>
             <TableHead className="text-xs">Technical</TableHead>
             <TableHead className="text-xs">Social</TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
           {seoScores.map((row) => (
             <TableRow key={row.page_path}>
               <TableCell className="font-mono text-xs">{row.page_path}</TableCell>
               <TableCell className="text-xs text-gray-500">{row.page_type ?? '—'}</TableCell>
               <TableCell>
                 <span className={`font-semibold ${scoreColor(row.overall_score)}`}>
                   {row.overall_score ?? '—'}
                 </span>
               </TableCell>
               <TableCell>
                 <Badge variant={gradeBadgeVariant(row.grade)}>
                   {row.grade ?? '—'}
                 </Badge>
               </TableCell>
               <TableCell className="text-xs">{row.content_quality_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.meta_elements_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.structure_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.links_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.media_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.schema_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.technical_score ?? '—'}</TableCell>
               <TableCell className="text-xs">{row.social_score ?? '—'}</TableCell>
             </TableRow>
           ))}
         </TableBody>
       </Table>
     )}
   </div>
   ```
   
   Add helper functions (at module scope, not inside the component — no `'use server'` conflict since these are pure functions in a server component file):
   ```ts
   function scoreColor(score: number | null): string {
     if (score === null) return 'text-gray-400'
     if (score >= 70) return 'text-green-700'
     if (score >= 50) return 'text-amber-600'
     return 'text-red-600'
   }
   
   function gradeBadgeVariant(grade: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
     switch (grade) {
       case 'A': case 'B': return 'default'
       case 'C': return 'secondary'
       case 'D': case 'F': return 'destructive'
       default: return 'outline'
     }
   }
   ```

## Must-Haves

- [ ] `seo_scores` queried server-side (no `useEffect`, no client fetch)
- [ ] Empty state renders "No SEO scores yet" message when `seoScores` is empty
- [ ] All 8 category score columns displayed in the table
- [ ] Grade rendered as a Badge with colour variant
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `pnpm --filter @monster/admin build` exits 0 (Next.js static build passes)
- `grep -n "seo_scores\|SEO Scores" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` — both present
- `grep "gradeBadgeVariant\|scoreColor" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` — helper functions present

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — current file; SEO section added after the "Site Generation" card
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — reference for Table + Badge import pattern
- `packages/db/src/types/supabase.ts` — `seo_scores` Row type for column names

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — updated with `seo_scores` query + SEO Scores card + helper functions
- `apps/admin/package.json` — `@monster/seo-scorer: workspace:*` added (if type import used)
