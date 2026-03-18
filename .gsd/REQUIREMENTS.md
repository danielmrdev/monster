# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — AI SEO content generation — homepage
- Class: primary-user-loop
- Status: active
- Description: User can trigger AI generation of `homepage_seo_text` + `focus_keyword` for a site from the admin panel
- Why it matters: Homepage SEO text is the most impactful content for ranking; manual writing is slow
- Source: user
- Primary owning slice: M015/S02
- Supporting slices: M015/S01, M015/S05
- Validation: unmapped
- Notes: Generates ~400-word markdown SEO text + focus keyword. Scored and iterated.

### R002 — AI SEO content generation — category
- Class: primary-user-loop
- Status: active
- Description: User can trigger AI generation of `seo_text` + `focus_keyword` + `description` for a single category
- Why it matters: Category pages drive most affiliate traffic; SEO text quality directly affects ranking
- Source: user
- Primary owning slice: M015/S03
- Supporting slices: M015/S01, M015/S05
- Validation: unmapped
- Notes: Generates ~400-word SEO text per category. Scored and iterated.

### R003 — AI SEO content generation — single product
- Class: primary-user-loop
- Status: active
- Description: User can trigger AI generation of all 4 SEO fields for a single product from the category product list
- Why it matters: Product pages convert visitors to clicks; detailed AI content improves dwell time and relevance
- Source: user
- Primary owning slice: M015/S04
- Supporting slices: M015/S01, M015/S05
- Validation: unmapped
- Notes: Generates `detailed_description`, `pros_cons`, `user_opinions_summary`, `meta_description`

### R004 — AI SEO content generation — all products in category
- Class: primary-user-loop
- Status: active
- Description: User can trigger batch generation for all products in a category that are missing SEO content
- Why it matters: Sites can have 50-100+ products; per-product manual triggering is impractical at scale
- Source: user
- Primary owning slice: M015/S04
- Supporting slices: M015/S01, M015/S05
- Validation: unmapped
- Notes: Processed in batches of 10. Progress tracked in ai_jobs payload.

### R005 — Content quality scoring feedback loop (≥80, max 3 retries)
- Class: quality-attribute
- Status: active
- Description: Each generation attempt is scored with `@monster/seo-scorer` `content_quality_score`; if < 80, the score and suggestions are fed back into the next prompt; max 3 attempts; best result accepted
- Why it matters: Ensures generated content meets a minimum SEO quality bar before saving
- Source: user
- Primary owning slice: M015/S01
- Supporting slices: M015/S02, M015/S03, M015/S04
- Validation: unmapped
- Notes: Scoring wraps markdown in minimal HTML: H1 + meta description tag + body. Only content_quality drives iteration.

### R006 — SEO job status visibility
- Class: operability
- Status: active
- Description: Each SEO generation action shows real-time job status (pending/running/completed/failed) on the relevant page
- Why it matters: Jobs take 10-60s; user needs feedback that something is happening
- Source: inferred
- Primary owning slice: M015/S05
- Supporting slices: M015/S01
- Validation: unmapped
- Notes: Reuses ai_jobs polling pattern from GenerateSiteButton/JobStatus components.

## Deferred

### R007 — Category proposals automation
- Class: primary-user-loop
- Status: deferred
- Description: AI-proposed category list for a site (the `/tsa categories` action)
- Why it matters: Useful but lower value — proposal is just a list, user still has to act on it
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — the manual `/tsa categories` skill covers this adequately for now

### R008 — Bulk homepage generation across all sites
- Class: operability
- Status: deferred
- Description: One-click to generate homepage SEO for all sites missing it
- Why it matters: Useful for portfolio-level batch operations
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred to a future milestone; per-site trigger is sufficient for M015

## Out of Scope

### R009 — Non-content scoring dimensions drive iteration
- Class: anti-feature
- Status: out-of-scope
- Description: Using meta, links, schema, or other SEO dimensions as iteration criteria
- Why it matters: Prevents over-engineering — those dimensions depend on the built site, not raw text
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Only `content_quality_score` is meaningful before the Astro build

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | primary-user-loop | active | M015/S02 | S01, S05 | unmapped |
| R002 | primary-user-loop | active | M015/S03 | S01, S05 | unmapped |
| R003 | primary-user-loop | active | M015/S04 | S01, S05 | unmapped |
| R004 | primary-user-loop | active | M015/S04 | S01, S05 | unmapped |
| R005 | quality-attribute | active | M015/S01 | S02, S03, S04 | unmapped |
| R006 | operability | active | M015/S05 | S01 | unmapped |
| R007 | primary-user-loop | deferred | none | none | unmapped |
| R008 | operability | deferred | none | none | unmapped |
| R009 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 6
- Mapped to slices: 6
- Validated: 0
- Unmapped active requirements: 0
