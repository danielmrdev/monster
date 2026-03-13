# S01 Roadmap Assessment — M002

**Verdict: roadmap unchanged. Proceed to S02.**

## Risk Retirement

All three S01-targeted risks retired on schedule:
- Service role client footgun → retired. createServiceClient() confirmed working in server actions and server components with live Supabase round-trips.
- `SiteCustomization` shape → retired. Canonical Zod schema in `packages/shared/src/types/customization.ts` — importable by M003 generator without circular dependency.
- shadcn component availability → retired. 6 components installed (card, select, textarea, badge, table, separator). Discovery: shadcn Select (Base UI headless) is incompatible with FormData in server action forms — native `<select>` required. This is documented in patterns and does not affect S02/S03/S04 scope.

## Success Criterion Coverage

- ~~User can create TSA site record with all fields; appears in Sites list~~ → **S01 complete**
- ~~User can open detail view, edit fields, changes persist~~ → **S01 complete**
- ~~`SiteCustomization` Zod schema defined and validated on create/edit~~ → **S01 complete**
- ~~Active nav link highlighted for all 7 routes~~ → **S01 complete**
- User can save API keys in Settings; retrieved correctly (masked) → **S03**
- Dashboard loads without errors; shows real KPI counts → **S02**
- User can add a cost entry; Finances page renders → **S04**
- All pages functional after pm2 restart → **S02, S03, S04** (each slice verifies after merge)

All remaining criteria have owning slices. Coverage check passes.

## Boundary Contracts

All S01 → S02/S03/S04 contracts verified accurate:
- `createServiceClient()` from `apps/admin/src/lib/supabase/service.ts` — confirmed, auditable import path
- Server action pattern (useActionState, return errors vs throw, revalidatePath + redirect) — established and tested
- `sites` table has real rows — S02 can read counts immediately without seeding
- `settings` and `costs` tables accessible via service client — no change from plan

## Requirement Coverage

No changes to requirement ownership or status. R001 supporting slice confirmed (site record creatable + editable). R013 continues to pass (pm2 reload + HTTP 200 on all new routes).

## Deviations with Downstream Impact

**Native `<select>` for server action forms** — S03 (Settings) and S04 (Finances) will have forms with dropdowns. Both must use native `<select>`, not `<Select>` from `apps/admin/src/components/ui/select.tsx`. This is documented in the S01 summary patterns and is the correct implementation — not a risk, just a pattern to follow.

## Next Slice

S02 (Dashboard KPIs) — no blockers. Ready to start.
