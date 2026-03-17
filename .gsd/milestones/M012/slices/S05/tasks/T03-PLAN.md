---
estimated_steps: 5
estimated_files: 1
---

# T03: Add Preview toggle and placeholder hint panel to TemplateForm

**Slice:** S05 — Legal Templates Seed + Markdown Pipeline
**Milestone:** M012

## Description

Enhance `TemplateForm` with a Preview toggle that shows rendered HTML using `marked` (dynamically imported on client) and a placeholder hint panel listing all 5 available substitution variables.

## Steps

1. Read `TemplateForm.tsx` completely — understand current structure and `'use client'` scope.
2. Add `const [isPreview, setIsPreview] = useState(false)` and `const [markedFn, setMarkedFn] = useState<typeof import('marked')['marked'] | null>(null)` state.
3. Add a "Preview" / "Edit" `<Button type="button">` near the content textarea header. On first click to preview: `const { marked: markedLib } = await import('marked'); setMarkedFn(() => markedLib); setIsPreview(true)`. On subsequent toggles: `setIsPreview(!isPreview)` only.
4. Replace the `<Textarea>` with a conditional: when `isPreview=true`, show `<div dangerouslySetInnerHTML={{ __html: markedFn ? markedFn(content) : '' }} className="prose prose-sm max-w-none border rounded p-4 min-h-[200px] bg-background" />` (where `content` is tracked via a `useState` that mirrors the textarea value via `onChange`). When `isPreview=false`, show the textarea.
5. Add a static placeholder hint panel below the content area (always visible, not collapsible): a small `<div>` with title "Available placeholders" and a list: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}` — each on its own line with a short description.

## Must-Haves

- [ ] Preview toggle button renders and toggles between textarea and HTML preview
- [ ] Placeholder hint panel is always visible with all 5 placeholders listed
- [ ] Dynamic import of `marked` is lazy (only on first Preview click)
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `grep "isPreview\|dangerouslySetInnerHTML" apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` → ≥2 hits
- `grep -c "{{site\." apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` → ≥4
- `pnpm --filter @monster/admin build` exits 0

## Inputs

- `apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` — current form (read first!)

## Expected Output

- `apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` — updated with Preview toggle + hint panel
