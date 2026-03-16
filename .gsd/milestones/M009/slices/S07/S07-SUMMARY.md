---
id: S07
milestone: M009
provides:
  - Full M009 integration verified: all 6 slices delivered, builds pass, pm2 reload passes
  - Astro check: 0 errors (generator)
  - All admin routes present in Next.js build output
key_decisions:
  - "generator pnpm build fails without site.json — expected; it's not a standalone build target; verified via astro check instead"
patterns_established:
  - "DB tables not in generated Supabase types: use (supabase as any) cast until migration applied + types regenerated via supabase gen types"
drill_down_paths:
  - .gsd/milestones/M009/M009-ROADMAP.md
duration: 20m
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S07: Integration + Polish

**Full M009 verified: pnpm --filter @monster/agents build ✓, pnpm --filter @monster/admin build ✓, astro check 0 errors ✓, pm2 reload ✓.**

## What Was Verified

All S01–S06 deliverables verified together:

- **Build**: `@monster/agents` and `@monster/admin` both exit 0
- **Generator**: `astro check` — 0 errors, 0 warnings
- **Routes**: /templates, /templates/[id]/edit, /templates/new all present in Next.js build output
- **pm2**: monster-admin reloads cleanly; HTTP 200 on /dashboard, /settings, /templates
- **DTS**: dist/index.d.ts present after agents build (postbuild copy confirmed)

## Open items for human UAT

All slices have UAT scripts. Key items requiring real runtime:

1. **S01**: Generate Site spinner visible on click; Preview slash removed; chat markdown renders
2. **S02**: DB migration for agent_prompts applied; "Generate with AI" button streams; prompts save in Settings
3. **S03**: Chat sidebar opens/closes; page context badge updates on navigation
4. **S04**: Amazon scraper returns real products for a test keyword from amazon.es
5. **S05**: SEO files present in dist/ after generation; IndexNow ping in logs after deploy
6. **S06**: DB migrations for legal_templates applied; template assigned to site renders in generated legal page

## DB Migrations to Apply on Remote Supabase

Three new migrations need `supabase db push` or manual SQL execution:
- `20260316125224_agent_prompts.sql`
- `20260316140000_legal_templates.sql`
- `20260316140001_legal_template_assignments.sql`

After applying, run `supabase gen types typescript --project-id <id> > packages/db/src/types/supabase.ts` to regenerate types and remove the `(supabase as any)` casts.
