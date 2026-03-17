# S05 Post-Slice Roadmap Assessment

**Milestone:** M012  
**Slice completed:** S05 — Legal Templates Seed + Markdown Pipeline  
**Assessed:** 2026-03-17  
**Verdict:** Roadmap is fine. No changes needed.

## Success Criterion Coverage

All M012 success criteria have at least one owning slice:

- `All product AI content fields editable and persist to DB` → ✅ Done in S02
- `Category meta_description editable from category form` → ✅ Done in S03
- `Homepage SEO text has dedicated editor in site edit page` → ✅ Done in S03
- `Settings organised into tabs; AI Prompts tab shows active default (not empty)` → ✅ Done in S04
- `Legal template editor has markdown preview and placeholder hint panel` → ✅ Done in S05
- `Generated sites render legal pages as formatted HTML with site-specific values substituted` → ✅ Done in S05
- `All three templates pass 375px mobile viewport test: hamburger, full-width CTAs, no overflow` → S06 ✅

Coverage check passes. No criterion is unowned.

## Risk Retirement

S05 retired both risks it was assigned:

- **`marked` async/sync concern** — resolved: v17 is synchronous. Admin uses lazy dynamic import. Generator uses sync call at build time.
- **`company_name`/`contact_email` not in SiteInfo** — resolved: `contact_email?: string` added to `SiteInfo`. All callers unaffected (optional field, `?? ''` fallback in `interpolateLegal`).

No new risks emerged that require roadmap changes.

## S06 Boundary Contracts

S06 scope and dependencies remain accurate. One item surfaced by S05 forward intelligence is already within S06's stated deliverables:

> `[legal].astro` currently compares `site.template_slug` against bare `"modern"` / `"minimal"` (not `"tsa/modern"` / `"tsa/minimal"`). The S01 migration updated all `sites.template_slug` values to `tsa/` prefixed slugs, so this switch will always fall through to the Classic branch for Modern and Minimal sites.

S06's boundary map explicitly states: "Template switch logic in all page files updated to use `tsa/classic`, `tsa/modern`, `tsa/minimal`". The `[legal].astro` file must be included in that sweep — it is a page file with the same switch pattern. No structural change to the roadmap is needed; this is a reminder for S06's planner.

## Requirement Coverage

R001 (pipeline completeness) is further advanced — legal pages now render formatted HTML with placeholder substitution. R042 (legal templates in DB, editable, rendered at build time) is structurally complete; full validation requires a live site with `legal_template_assignments` populated by `GenerateSiteJob` (the generator pipeline is wired; the job-side read of `legal_template_assignments` is a known gap flagged as a follow-up, not blocking M012 DoD).

Remaining active requirements retain credible coverage. No requirements invalidated or newly surfaced.

## Conclusion

S06 (Templates Mobile-First) proceeds as planned. No slice reordering, merging, or splitting warranted.
