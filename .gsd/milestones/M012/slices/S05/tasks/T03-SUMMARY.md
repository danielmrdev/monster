---
id: T03
parent: S05
milestone: M012
provides:
  - Preview toggle (Edit/Preview button) in TemplateForm with lazy-loaded marked for client-side markdown rendering
  - Placeholder hint panel always visible with all 5 substitution variables documented
  - marked added to @monster/admin dependencies
key_files:
  - apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx
key_decisions:
  - marked dynamically imported (await import('marked')) only on first Preview click — avoids adding it to the initial JS bundle
  - content tracked via useState + onChange on Textarea so it's available for preview rendering; hidden input preserves value during form submission while in preview mode
  - markedFn stored as (src: string) => string callback (not the raw import) to avoid React's setState-with-function ambiguity (setState(() => fn) vs setState(fn))
patterns_established:
  - Dynamic import for client-side markdown preview: import on demand, cache the function in state, subsequent toggles skip the import
  - Hidden input pattern for controlled form fields in preview mode — textarea unmounts in preview, hidden input carries the value to form submission
observability_surfaces:
  - Browser Network tab → filter "marked" → chunk request visible on first Preview click
  - Browser DevTools Elements → input[type=hidden][name=content] present when isPreview=true
  - grep "Available placeholders" apps/admin/src/app/\(dashboard\)/templates/TemplateForm.tsx — confirms hint panel present
duration: ~8min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Add Preview toggle and placeholder hint panel to TemplateForm

**Added Preview/Edit toggle with lazy-loaded `marked` and always-visible placeholder hint panel to TemplateForm, with `marked` added to admin package dependencies.**

## What Happened

Read `TemplateForm.tsx` to understand the existing uncontrolled textarea + `useActionState` structure. Added two pieces of UI:

1. **Preview toggle** — A `useState(false)` for `isPreview` and a nullable `markedFn` state. A `<Button type="button">` labeled "Preview"/"Edit" sits in the content field header row. On first click: `await import('marked')` runs, the result is stored as a typed `(src: string) => string` callback, and `isPreview` flips to `true`. Subsequent toggles just flip `isPreview`. The textarea is replaced by a `<div dangerouslySetInnerHTML>` in preview mode; a hidden `<input>` preserves the content value for form submission.

2. **Placeholder hint panel** — A static `<div>` below the content area (always visible) listing all 5 substitution variables with descriptions: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}`.

The content field was converted from uncontrolled (`defaultValue`) to controlled (`value` + `onChange`) to make the value available for preview rendering.

**Dependency gap:** `marked` was already in the pnpm store (used by `@monster/generator`) but not declared in `apps/admin/package.json`. Added it with `pnpm --filter @monster/admin add marked`. The build then compiled cleanly.

## Verification

```
grep -E "isPreview|dangerouslySetInnerHTML" apps/admin/src/app/\(dashboard\)/templates/TemplateForm.tsx
# → 6 hits (isPreview x4, dangerouslySetInnerHTML x1, isPreview && x1)

grep -c "site\." apps/admin/src/app/\(dashboard\)/templates/TemplateForm.tsx
# → 4 (site.name, site.domain, site.contact_email, site.affiliate_tag)

pnpm --filter @monster/admin build
# → exit 0, all 34 routes compiled
```

## Diagnostics

- **Preview not rendering HTML:** Check browser console for errors from `import('marked')`. If chunk request fails (Network tab), verify `marked` is in admin's `node_modules`.
- **Form submits empty content while in Preview mode:** Check that `<input type="hidden" name="content">` is in the DOM when `isPreview=true` (DevTools → Elements).
- **marked not found at build:** `marked` must be in `apps/admin/package.json` dependencies — run `pnpm --filter @monster/admin add marked` if missing.

## Deviations

- `marked` had to be added to `apps/admin/package.json` — not anticipated in the plan (plan assumed it was already available to the admin package, but it was only in the generator package).
- `markedFn` state type changed from `typeof import('marked')['marked'] | null` to `((src: string) => string) | null` — the plan's type creates a React state-with-function setter ambiguity; wrapping the call in an arrow function and storing only the typed callback avoids it.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` — Added Preview toggle, lazy marked import, hidden content input, placeholder hint panel; converted content field to controlled
- `apps/admin/package.json` — Added `marked` dependency
- `.gsd/milestones/M012/slices/S05/tasks/T03-PLAN.md` — Added missing `## Observability Impact` section (pre-flight fix)
