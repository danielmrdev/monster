---
estimated_steps: 3
estimated_files: 2
---

# T02: SiteForm defaultValues + /sites/new searchParams + CTA wiring

**Slice:** S03 — Research Report UI + Domain Suggestions + Create Site CTA
**Milestone:** M007

## Description

Close the "Create site from this research" CTA loop by making `/sites/new` accept `niche` and `market` query params and pre-fill the form. T01 builds the Link with the correct URL; T02 makes the destination page consume it.

## Steps

1. **Add `defaultValues` prop to `SiteForm`**: Change `export function SiteForm()` to `export function SiteForm({ defaultValues }: { defaultValues?: { niche?: string; market?: string } })`. Wire:
   - Niche `Textarea`: add `defaultValue={defaultValues?.niche ?? ''}` prop
   - Market `NativeSelect`: change `defaultValue=""` to `defaultValue={defaultValues?.market ?? ''}` — this causes the select to pre-select the matching option if it exists in `AMAZON_MARKETS`

2. **Update `/sites/new/page.tsx`**: Add `interface PageProps { searchParams: Promise<{ niche?: string; market?: string }> }`. Change `export default function NewSitePage()` to `export default async function NewSitePage({ searchParams }: PageProps)`. Await `searchParams` and extract `niche` and `market`. Pass `defaultValues={{ niche, market }}` to `<SiteForm />`.

3. **Verify build and typecheck**: Run `pnpm -r typecheck` and `pnpm --filter @monster/admin build`. Both must exit 0.

## Must-Haves

- [ ] `SiteForm` accepts `defaultValues?: { niche?: string; market?: string }` prop
- [ ] Niche `Textarea` has `defaultValue={defaultValues?.niche ?? ''}` (not `value=` — uncontrolled)
- [ ] Market `NativeSelect` has `defaultValue={defaultValues?.market ?? ''}` so pre-selection works
- [ ] `/sites/new/page.tsx` is `async`, awaits `searchParams`, passes niche+market to `SiteForm`
- [ ] No URL decoding needed — Next.js `searchParams` already delivers decoded values
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm -r typecheck` exits 0

## Verification

```bash
pnpm -r typecheck
pnpm --filter @monster/admin build

# Confirm defaultValues prop exists in SiteForm
grep -n "defaultValues" apps/admin/src/app/(dashboard)/sites/new/site-form.tsx

# Confirm page.tsx is now async and reads searchParams
grep -n "searchParams" apps/admin/src/app/(dashboard)/sites/new/page.tsx
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `SiteForm` component; `NativeSelect` already accepts `defaultValue` prop; niche field is `<Textarea>` (uncontrolled)
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — currently static, no props, no async — needs to become async with `searchParams`
- T01 `ResearchReportViewer.tsx` — the CTA Link it builds: `/sites/new?niche=${encodeURIComponent(niche_idea)}&market=${encodeURIComponent(market)}`; T02 must consume those exact params

## Observability Impact

**What changes at runtime:**
- `/sites/new?niche=...&market=...` now pre-fills the form. If niche or market params are missing or empty, the form renders with empty defaults — no error, no crash.
- `SiteForm` is still a client component (`'use client'`) — pre-fill uses uncontrolled `defaultValue`, not `value`, so React doesn't take ownership of the field state after mount.

**How a future agent inspects this:**
- Navigate to `/sites/new?niche=camping+gear&market=US` — niche textarea and market select should be pre-filled on page load.
- `grep -n "defaultValues" apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — must show at least 3 hits (signature, niche, market).
- `grep -n "searchParams" apps/admin/src/app/(dashboard)/sites/new/page.tsx` — must show the `Promise<{...}>` type and the `await searchParams` call.

**Failure state surface:**
- If niche textarea is empty despite a `?niche=...` param: `page.tsx` is likely not async or `searchParams` is not awaited — check `grep -n "async" apps/admin/src/app/(dashboard)/sites/new/page.tsx`.
- If market select is not pre-selected: the market value from the URL doesn't match a value in `AMAZON_MARKETS` (case-sensitive) — log the decoded value in server console to verify.
- TypeScript build errors referencing `defaultValues` signal the prop type or `SiteForm` signature was changed incorrectly.

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `SiteForm` with `defaultValues` prop; niche textarea and market select pre-filled when provided
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — async server component reading `searchParams.niche` and `searchParams.market`, passing to `SiteForm`
